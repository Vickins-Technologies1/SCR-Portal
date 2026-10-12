import { Db, ObjectId } from "mongodb";
import { calculateFixedUtilityBreakdown, getPostedMeteredUtilityBreakdown, UtilityDueBreakdown } from "@/lib/property-utilities";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateOverduePenalty, calculateTenantRentDueToDate, resolveTenantRequiredDeposit } from "@/lib/utils";
import { financialPostingFilter, identityFilter, identityValues, isSuccessfulPaymentStatus, paymentEventDate, successfulPaymentFilter } from "@/lib/payment-query";

export type PaymentAllocation = {
  deposit: number;
  rent: number;
  utilities: number;
  other: number;
  walletCredit: number;
  walletApplied: number;
  utilityAllocations?: Array<{ utilityChargeId: string; billingPeriod: string; amount: number }>;
};

export type PaymentCategory = "Rent" | "Utility" | "Deposit" | "Other" | "General";

export type LedgerPayment = {
  _id: ObjectId;
  amount: number;
  postedAmount?: number;
  type?: PaymentCategory;
  status?: string;
  paymentDate?: string;
  createdAt?: string;
  allocation?: Partial<PaymentAllocation>;
};

export type TenantFinancialState = {
  monthsStayed: number;
  depositRequired: number;
  depositPaid: number;
  depositOutstanding: number;
  rentCharged: number;
  rentPaid: number;
  rentOutstanding: number;
  utilitiesCharged: number;
  utilitiesPaid: number;
  utilitiesOutstanding: number;
  utilitiesCurrentOutstanding: number;
  utilitiesOverdueOutstanding: number;
  utilityStatus: "CURRENT" | "OVERDUE" | "PAID";
  overdueRent: number;
  overdueUtilities: number;
  penalties: number;
  overdueAmount: number;
  totalOutstanding: number;
  walletBalance: number;
  paymentAllocations: Map<string, PaymentAllocation>;
};

export type UtilityChargeAllocationTarget = {
  utilityChargeId: string;
  billingPeriod: string;
  amount: number;
  outstandingAmount?: number;
};

/** Allocate utility funds oldest-first across concrete posted charges. */
export function allocateUtilityPaymentAcrossCharges(
  amount: number,
  charges: UtilityChargeAllocationTarget[],
) {
  let remaining = money(amount);
  return charges.flatMap((charge) => {
    if (remaining <= 0) return [];
    const available = money(charge.outstandingAmount ?? charge.amount);
    if (available <= 0) return [];
    const applied = money(Math.min(available, remaining));
    remaining = money(remaining - applied);
    return [{ utilityChargeId: charge.utilityChargeId, billingPeriod: charge.billingPeriod, amount: applied }];
  });
}

/**
 * Aggregates the deposit contribution of already-calculated tenant states.
 * Keeping this small operation separate makes dashboard/report consumers use
 * the ledger result rather than reinterpreting raw payment types.
 */
export function sumTenantDepositPaid(states: Iterable<Pick<TenantFinancialState, "depositPaid">>) {
  let total = 0;
  for (const state of states) total += amountOf(state.depositPaid);
  return money(total);
}

export function sumTenantOverdueAmount(
  states: Iterable<Pick<TenantFinancialState, "overdueRent" | "overdueUtilities">>
) {
  let total = 0;
  for (const state of states) total += amountOf(state.overdueRent) + amountOf(state.overdueUtilities);
  return money(total);
}

const money = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
const amountOf = (value: unknown) => (Number.isFinite(Number(value)) ? money(Number(value)) : 0);

const scopedPropertyFilter = (propertyId: unknown) => {
  const identities = identityValues(propertyId);
  if (!identities.length) return {};
  return {
    $or: [
      { propertyId: { $in: identities } },
      // Some historical payment/utility rows predate property linkage. Keep
      // those rows eligible when tenantId is authoritative, but never admit a
      // row explicitly linked to another property.
      { propertyId: { $exists: false } },
      { propertyId: null },
    ],
  };
};

const paymentDateValue = (payment: Pick<LedgerPayment, "paymentDate" | "createdAt">) => {
  return paymentEventDate(payment as unknown as Record<string, unknown>)?.getTime() ?? null;
};

const eligiblePaymentFilter = (tenant: any) => ({
  $and: [
    identityFilter("tenantId", tenant._id),
    successfulPaymentFilter(),
    financialPostingFilter(),
    scopedPropertyFilter(tenant.propertyId),
  ],
});

export function allocatePaymentLedger(params: {
  depositDue?: number;
  rentDue: number;
  utilityDue: number;
  otherDue?: number;
  walletBalance?: number;
  payments: LedgerPayment[];
}) {
  let rentPaid = 0;
  let depositPaid = 0;
  let utilitiesPaid = 0;
  let otherPaid = 0;
  let wallet = amountOf(params.walletBalance);
  const allocations = new Map<string, PaymentAllocation>();
  const rentDue = amountOf(params.rentDue);
  const depositDue = amountOf(params.depositDue);
  const utilityDue = amountOf(params.utilityDue);
  const otherDue = amountOf(params.otherDue);

  for (const payment of params.payments.filter((entry) => isSuccessfulPaymentStatus(entry.status))) {
    const paymentAmount = amountOf(payment.amount);
    const previousWallet = wallet;
    const category = payment.type;
    let deposit = 0;
    let rent = 0;
    let utilities = 0;
    let other = 0;
    let funds = paymentAmount;
    let walletApplied = 0;
    const isExplicitCategory = category === "Deposit" || category === "Rent" || category === "Utility" || category === "Other";

    // Rent-selected payments cascade through the tenant's real obligations.
    // Explicit Utility/Deposit/Other payments remain category-isolated.
    if (category === "Deposit") {
      deposit = Math.min(Math.max(0, depositDue - depositPaid), funds);
    } else if (category === "Rent") {
      deposit = Math.min(Math.max(0, depositDue - depositPaid), funds);
      funds -= deposit;
      rent = Math.min(Math.max(0, rentDue - rentPaid), funds);
      funds -= rent;
      utilities = Math.min(Math.max(0, utilityDue - utilitiesPaid), funds);
      funds -= utilities;
      other = Math.min(Math.max(0, otherDue - otherPaid), funds);
      funds -= other;
    } else if (category === "Utility") {
      utilities = Math.min(Math.max(0, utilityDue - utilitiesPaid), funds);
    } else if (category === "Other") {
      other = Math.min(Math.max(0, otherDue - otherPaid), funds);
    } else {
      // General/legacy payments follow the established deterministic order.
      deposit = Math.min(Math.max(0, depositDue - depositPaid), funds);
      funds = previousWallet + paymentAmount - deposit;
      rent = Math.min(Math.max(0, rentDue - rentPaid), funds);
      funds -= rent;
      utilities = Math.min(Math.max(0, utilityDue - utilitiesPaid), funds);
      funds -= utilities;
      other = Math.min(Math.max(0, otherDue - otherPaid), funds);
      funds -= other;
      // Treat the current payment as being used before older wallet credit.
      // This makes the source payment's wallet credit auditable and avoids
      // counting the same amount as both a credit and a consumption.
      walletApplied = Math.min(previousWallet, Math.max(0, deposit + rent + utilities + other - paymentAmount));
    }
    const allocated = deposit + rent + utilities + other;
    if (isExplicitCategory) {
      funds = paymentAmount - allocated;
      wallet = money(previousWallet + Math.max(0, funds));
    } else {
      wallet = money(previousWallet + paymentAmount - allocated);
    }
    depositPaid += deposit;
    rentPaid += rent;
    utilitiesPaid += utilities;
    otherPaid += other;
    const walletCredit = !isExplicitCategory
      ? Math.max(0, paymentAmount - Math.max(0, allocated - previousWallet))
      : Math.max(0, paymentAmount - allocated);
    allocations.set(payment._id.toString(), {
      deposit: money(deposit),
      rent: money(rent),
      utilities: money(utilities),
      other: money(other),
      walletCredit: money(walletCredit),
      walletApplied: money(walletApplied),
    });
  }
  return { depositPaid: money(depositPaid), rentPaid: money(rentPaid), utilitiesPaid: money(utilitiesPaid), otherPaid: money(otherPaid), walletBalance: wallet, allocations };
}

export function deriveTenantFinancialState(params: {
  tenant: any;
  asOf: Date;
  rentDue: number;
  monthsStayed: number;
  utilityBreakdown: UtilityDueBreakdown;
  depositDue: number;
  payments: LedgerPayment[];
  reversedByPayment?: ReadonlyMap<string, number>;
  property?: any;
}): TenantFinancialState {
  const cutoff = params.asOf.getTime();
  const reversedByPayment = params.reversedByPayment ?? new Map<string, number>();
  const eligiblePayments = params.payments
    .filter((payment) => {
      if (!isSuccessfulPaymentStatus(payment.status)) return false;
      const date = paymentDateValue(payment);
      return date === null || date <= cutoff;
    })
    .sort((a, b) => (paymentDateValue(a) ?? 0) - (paymentDateValue(b) ?? 0) || String(a._id).localeCompare(String(b._id)))
    .map((payment) => ({
      ...payment,
      amount: money(Math.max(0, Number(payment.postedAmount ?? payment.amount) - (reversedByPayment.get(String(payment._id)) || 0))),
    }));
  const ledger = allocatePaymentLedger({
    depositDue: params.depositDue,
    rentDue: params.rentDue,
    utilityDue: params.utilityBreakdown.charged,
    otherDue: 0,
    walletBalance: 0,
    payments: eligiblePayments,
  });
  const utilityOverdueCharged = money(params.utilityBreakdown.overdueCharged);
  const penalties = money(calculateOverduePenalty({
    rentDues: money(Math.max(0, params.rentDue - ledger.rentPaid)),
    today: params.asOf,
    rentPaymentDate: params.property?.rentPaymentDate,
    leaseStartDate: params.tenant.leaseStartDate,
    penaltyAmount: params.property?.penaltyAmount,
    penaltyFrequency: params.property?.penaltyFrequency,
  }));
  const depositOutstanding = money(Math.max(0, params.depositDue - ledger.depositPaid));
  const rentOutstanding = money(Math.max(0, params.rentDue - ledger.rentPaid));
  const utilitiesOutstanding = money(Math.max(0, params.utilityBreakdown.charged - ledger.utilitiesPaid));
  const utilitiesOverdueOutstanding = money(Math.min(utilitiesOutstanding, Math.max(0, utilityOverdueCharged - ledger.utilitiesPaid)));
  const utilitiesCurrentOutstanding = money(Math.max(0, utilitiesOutstanding - utilitiesOverdueOutstanding));
  const overdueRent = rentOutstanding;
  const overdueUtilities = utilitiesOverdueOutstanding;
  return {
    monthsStayed: params.monthsStayed,
    depositRequired: money(params.depositDue),
    depositPaid: ledger.depositPaid,
    depositOutstanding,
    rentCharged: money(params.rentDue),
    rentPaid: ledger.rentPaid,
    rentOutstanding,
    utilitiesCharged: money(params.utilityBreakdown.charged),
    utilitiesPaid: ledger.utilitiesPaid,
    utilitiesOutstanding,
    utilitiesCurrentOutstanding,
    utilitiesOverdueOutstanding,
    utilityStatus: utilitiesOutstanding <= 0 ? "PAID" : utilitiesOverdueOutstanding > 0 ? "OVERDUE" : "CURRENT",
    overdueRent,
    overdueUtilities,
    penalties,
    overdueAmount: money(overdueRent + overdueUtilities),
    totalOutstanding: money(depositOutstanding + rentOutstanding + utilitiesOutstanding + penalties),
    walletBalance: ledger.walletBalance,
    paymentAllocations: ledger.allocations,
  };
}

/**
 * The single financial source of truth. Consumers should aggregate this state
 * instead of subtracting payment-type totals from raw lease values.
 */
export async function calculateTenantFinancialState(
  db: Db,
  tenant: any,
  options: { asOf?: Date; property?: any; rentOverrideMap?: Map<string, any> } = {}
): Promise<TenantFinancialState> {
  const asOf = options.asOf ?? new Date();
  const propertyId = String(tenant.propertyId || "").trim();
  const property = options.property ?? (propertyId
    ? await db.collection("properties").findOne(
        ObjectId.isValid(propertyId)
          ? { $or: [{ _id: new ObjectId(propertyId) }, { _id: propertyId as any }] }
          : { _id: propertyId as any },
      )
    : null);
  const overrides = options.rentOverrideMap ?? await fetchActiveRentOverridesByPropertyIds(db, [String(tenant.propertyId)]);
  const { rentDue, monthsStayed } = calculateTenantRentDueToDate({ tenant, today: asOf, rentOverrideMap: overrides });
  const fixedUtilities = calculateFixedUtilityBreakdown({
    utilities: property?.utilities,
    tenant,
    today: asOf,
    paymentDay: property?.rentPaymentDate,
  });
  const meteredUtilities = await getPostedMeteredUtilityBreakdown(
    db,
    String(tenant._id),
    asOf,
    property?.rentPaymentDate,
    tenant.propertyId,
  );
  const utilityBreakdown: UtilityDueBreakdown = {
    charged: money(fixedUtilities.charged + meteredUtilities.charged),
    currentCharged: money(fixedUtilities.currentCharged + meteredUtilities.currentCharged),
    overdueCharged: money(fixedUtilities.overdueCharged + meteredUtilities.overdueCharged),
  };
  const depositDue = money(resolveTenantRequiredDeposit({ tenant, unitTypes: property?.unitTypes }));
  const payments = await db.collection<LedgerPayment>("payments")
    .find(eligiblePaymentFilter(tenant))
    .toArray();
  const paymentIds = payments.map((payment) => payment._id);
  const reversalIds = [...paymentIds, ...paymentIds.map((paymentId) => paymentId.toString())];
  const reversalRows = paymentIds.length
    ? await db.collection("financialLedger").aggregate<{ _id: ObjectId; total: number }>([
        { $match: { kind: "PAYMENT_REVERSED", status: "posted", sourcePaymentId: { $in: reversalIds } } },
        { $group: { _id: "$sourcePaymentId", total: { $sum: "$amount" } } },
      ]).toArray()
    : [];
  const reversedByPayment = new Map(reversalRows.map((row) => [String(row._id), money(Number(row.total) || 0)]));
  return deriveTenantFinancialState({
    tenant,
    asOf,
    rentDue,
    monthsStayed,
    utilityBreakdown,
    depositDue,
    payments,
    reversedByPayment,
    property,
  });
}

export async function reconcileTenantPaymentAllocation(db: Db, tenantId: string) {
  if (!ObjectId.isValid(tenantId)) return null;
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
  if (!tenant) return null;

  const property = ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne({ _id: new ObjectId(String(tenant.propertyId)) })
    : null;
  const today = new Date();
  const state = await calculateTenantFinancialState(db, tenant, { asOf: today, property });
  const allocations = state.paymentAllocations;
  const depositPaid = state.depositPaid;
  const rentPaid = state.rentPaid;
  const utilitiesPaid = state.utilitiesPaid;
  const otherPaid = 0;
  const wallet = state.walletBalance;

  for (const [paymentId, allocation] of allocations) {
    if (ObjectId.isValid(paymentId)) {
      await db.collection("payments").updateOne({ _id: new ObjectId(paymentId) }, { $set: { allocation } });
      if (allocation.walletApplied && allocation.walletApplied > 0) {
        const payment = await db.collection("payments").findOne({ _id: new ObjectId(paymentId) }, { projection: { tenantId: 1, propertyId: 1 } });
        if (payment) {
          await db.collection("walletTransactions").updateOne(
            { eventKey: `payment:${paymentId}:credit-consumed` },
            { $setOnInsert: {
              eventKey: `payment:${paymentId}:credit-consumed`,
              kind: "CREDIT_CONSUMED",
              direction: "DEBIT",
              amount: money(allocation.walletApplied),
              tenantId: payment.tenantId,
              propertyId: payment.propertyId || null,
              sourcePaymentId: new ObjectId(paymentId),
              reason: "Credit applied to a later obligation",
              actorRole: "system",
              createdAt: new Date().toISOString(),
            } },
            { upsert: true },
          );
        }
      }
    }
  }

  // Metered utility payments are also projected onto concrete posted charges,
  // oldest billing period first. The category allocation above remains the
  // authoritative tenant total; this mapping makes the period-level audit
  // trail deterministic without changing fixed-utility behaviour.
  const utilityCharges = await db.collection("utilityCharges")
    .find({ tenantId: { $in: identityValues(tenantId) }, status: "posted", ...scopedPropertyFilter(tenant.propertyId) })
    .sort({ billingPeriod: 1, createdAt: 1, _id: 1 })
    .toArray();
  const chargeRemaining = new Map(utilityCharges.map((charge: any) => [String(charge._id), Math.max(0, Number(charge.amount) || 0)]));
  for (const payment of await db.collection("payments")
    .find({ ...eligiblePaymentFilter(tenant) })
    .sort({ paymentDate: 1, createdAt: 1, _id: 1 })
    .toArray()) {
    if (!allocations.has(String(payment._id))) continue;
    let remaining = Math.max(0, Number(allocations.get(String(payment._id))?.utilities || 0));
    const utilityAllocations: Array<{ utilityChargeId: string; billingPeriod: string; amount: number }> = [];
    utilityAllocations.push(...allocateUtilityPaymentAcrossCharges(remaining, utilityCharges.map((charge: any) => ({
      utilityChargeId: String(charge._id),
      billingPeriod: String(charge.billingPeriod || ""),
      amount: chargeRemaining.get(String(charge._id)) || 0,
    }))));
    for (const allocation of utilityAllocations) {
      const available = chargeRemaining.get(allocation.utilityChargeId) || 0;
      chargeRemaining.set(allocation.utilityChargeId, money(available - allocation.amount));
      remaining = money(remaining - allocation.amount);
    }
    await db.collection("payments").updateOne({ _id: payment._id }, { $set: { utilityAllocations } });
  }

  const rentOutstanding = state.rentOutstanding;
  const utilitiesOutstanding = state.utilitiesOutstanding;
  const depositOutstanding = state.depositOutstanding;
  const otherOutstanding = 0;
  const totalOutstanding = state.totalOutstanding;
  await db.collection("tenants").updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: {
      totalRentPaid: money(rentPaid),
      totalUtilityPaid: money(utilitiesPaid),
      totalDepositPaid: money(depositPaid),
      walletBalance: money(wallet),
      paymentStatus: totalOutstanding > 0 ? "overdue" : "up-to-date",
      updatedAt: today.toISOString(),
    } }
  );

  return {
    monthsStayed: state.monthsStayed,
    rentPaid: money(rentPaid),
    utilityPaid: money(utilitiesPaid),
    depositPaid: money(depositPaid),
    otherPaid: money(otherPaid),
    walletBalance: money(wallet),
    rentDue: state.rentCharged,
    utilityDue: state.utilitiesCharged,
    depositDue: state.depositRequired,
    rentOutstanding,
    utilitiesOutstanding,
    utilitiesCurrentOutstanding: state.utilitiesCurrentOutstanding,
    utilitiesOverdueOutstanding: state.utilitiesOverdueOutstanding,
    utilityStatus: state.utilityStatus,
    penalties: state.penalties,
    depositOutstanding,
    otherOutstanding,
    totalOutstanding,
  };
}

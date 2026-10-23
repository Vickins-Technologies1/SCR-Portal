import { Db, ObjectId } from "mongodb";
import { calculateFixedUtilityBreakdown, getPostedMeteredUtilityBreakdown, UtilityDueBreakdown } from "@/lib/property-utilities";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateOverduePenalty, calculateTenantRentDueToDate, resolveTenantRequiredDeposit } from "@/lib/utils";
import { getFinancialPaymentRows } from "@/lib/financial-reporting";
import { identityValues, isSuccessfulPaymentStatus, paymentEventDate } from "@/lib/payment-query";
import { businessDateParts } from "@/lib/business-time";

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
  allocationPolicyVersion?: string;
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
  otherPaid: number;
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
  walletApplied: number;
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

/** Payment status means past-due rent/utilities, not any outstanding balance. */
export function tenantOverdueStatus(state: Pick<TenantFinancialState, "overdueAmount">): "overdue" | "up-to-date" {
  return state.overdueAmount > 0 ? "overdue" : "up-to-date";
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

type AllocationField = "deposit" | "rent" | "utilities" | "other";

const defaultAllocationPriority: AllocationField[] = ["deposit", "rent", "utilities", "other"];

/**
 * New receipts always clear obligations in deposit-first order. A declared
 * category does not override the deposit-first policy.
 */
function allocationPriority(): AllocationField[] {
  return [...defaultAllocationPriority];
}

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
    let deposit = 0;
    let rent = 0;
    let utilities = 0;
    let other = 0;
    let walletApplied = 0;

    const paidByField: Record<AllocationField, number> = {
      deposit: depositPaid,
      rent: rentPaid,
      utilities: utilitiesPaid,
      other: otherPaid,
    };
    const dueByField: Record<AllocationField, number> = {
      deposit: depositDue,
      rent: rentDue,
      utilities: utilityDue,
      other: otherDue,
    };
    const allocationByField: Record<AllocationField, number> = {
      deposit: 0,
      rent: 0,
      utilities: 0,
      other: 0,
    };

    // A persisted allocation is the historical receipt classification. Keep
    // it fixed when current obligations/configuration change. Legacy payments
    // without a snapshot use the declared category fallback supplied by the
    // financial projection; only new unsnapshotted payments are allocated
    // against current dues below.
    if (payment.allocation) {
      let remainingReceipt = paymentAmount;
      for (const field of defaultAllocationPriority) {
        const fixed = amountOf(payment.allocation[field]);
        const accepted = money(Math.min(fixed, remainingReceipt));
        allocationByField[field] = accepted;
        remainingReceipt = money(remainingReceipt - accepted);
      }
      const fixedWalletCredit = amountOf(payment.allocation.walletCredit);
      const walletCredit = money(Math.min(fixedWalletCredit || remainingReceipt, remainingReceipt));
      remainingReceipt = money(remainingReceipt - walletCredit);
      const fixedAllocation = { ...allocationByField };

      // Wallet applications are balance uses, not part of the historical
      // receipt classification. Reapply available wallet funds to current
      // obligations while leaving the original receipt categories untouched.
      const applyWallet = (available: number) => {
        let remaining = money(available);
        for (const field of defaultAllocationPriority) {
          if (remaining <= 0) break;
          const outstanding = money(Math.max(0, dueByField[field] - paidByField[field] - allocationByField[field]));
          const applied = money(Math.min(outstanding, remaining));
          allocationByField[field] += applied;
          remaining = money(remaining - applied);
        }
        return { allocated: money(available - remaining), remaining };
      };
      const walletResult = previousWallet > 0 ? applyWallet(previousWallet) : { allocated: 0, remaining: 0 };
      walletApplied = walletResult.allocated;
      deposit = allocationByField.deposit;
      rent = allocationByField.rent;
      utilities = allocationByField.utilities;
      other = allocationByField.other;
      wallet = money(walletResult.remaining + walletCredit + remainingReceipt);
      depositPaid += deposit;
      rentPaid += rent;
      utilitiesPaid += utilities;
      otherPaid += other;
      allocations.set(payment._id.toString(), {
        deposit: money(fixedAllocation.deposit),
        rent: money(fixedAllocation.rent),
        utilities: money(fixedAllocation.utilities),
        other: money(fixedAllocation.other),
        walletCredit: money(walletCredit + remainingReceipt),
        walletApplied: money(walletApplied),
      });
      continue;
    }

    const applyFunds = (available: number) => {
      let remaining = money(available);
      for (const field of allocationPriority()) {
        if (remaining <= 0) break;
        const outstanding = money(Math.max(0, dueByField[field] - paidByField[field] - allocationByField[field]));
        const applied = money(Math.min(outstanding, remaining));
        allocationByField[field] += applied;
        remaining = money(remaining - applied);
      }
      return { allocated: money(available - remaining), remaining };
    };

    // Apply the current payment before any pre-existing wallet credit. If
    // the payment does not cover all obligations, an existing wallet balance
    // may then be consumed. This keeps the source payment and wallet debit
    // auditable while ensuring no credit survives an outstanding due.
    const paymentFunds = applyFunds(paymentAmount);
    const hasOutstandingDues = (Object.keys(dueByField) as AllocationField[]).some((field) =>
      dueByField[field] - paidByField[field] - allocationByField[field] > 0
    );
    const walletFunds = previousWallet > 0 && (paymentFunds.remaining > 0 || hasOutstandingDues)
      ? applyFunds(previousWallet)
      : { allocated: 0, remaining: previousWallet };
    walletApplied = walletFunds.allocated;
    deposit = allocationByField.deposit;
    rent = allocationByField.rent;
    utilities = allocationByField.utilities;
    other = allocationByField.other;

    const walletCredit = paymentFunds.remaining;
    wallet = money(walletFunds.remaining + walletCredit);
    depositPaid += deposit;
    rentPaid += rent;
    utilitiesPaid += utilities;
    otherPaid += other;
    allocations.set(payment._id.toString(), {
      deposit: money(deposit),
      rent: money(rent),
      utilities: money(utilities),
      other: money(other),
      walletCredit: money(walletCredit),
      walletApplied: money(walletApplied),
    });
  }
  const walletApplied = [...allocations.values()].reduce((sum, allocation) => sum + amountOf(allocation.walletApplied), 0);
  return {
    depositPaid: money(depositPaid),
    rentPaid: money(rentPaid),
    utilitiesPaid: money(utilitiesPaid),
    otherPaid: money(otherPaid),
    walletBalance: wallet,
    walletApplied: money(walletApplied),
    allocations,
  };
}

export function deriveTenantFinancialState(params: {
  tenant: any;
  asOf: Date;
  rentDue: number;
  monthsStayed: number;
  utilityBreakdown: UtilityDueBreakdown;
  depositDue: number;
  overdueRentCharged?: number;
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
  const overdueRentCharged = money(params.overdueRentCharged ?? params.rentDue);
  const overdueRent = money(Math.max(0, overdueRentCharged - ledger.rentPaid));
  const penalties = money(calculateOverduePenalty({
    rentDues: overdueRent,
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
  const overdueUtilities = utilitiesOverdueOutstanding;
  return {
    monthsStayed: params.monthsStayed,
    depositRequired: money(params.depositDue),
    depositPaid: ledger.depositPaid,
    depositOutstanding,
    rentCharged: money(params.rentDue),
    rentPaid: ledger.rentPaid,
    otherPaid: ledger.otherPaid,
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
    walletApplied: ledger.walletApplied,
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
  const leaseStart = tenant.leaseStartDate ? new Date(tenant.leaseStartDate) : null;
  const paymentDay = property?.rentPaymentDate ?? (leaseStart && !Number.isNaN(leaseStart.getTime()) ? businessDateParts(leaseStart).day : 1);
  const { rentDue, overdueRentDue, monthsStayed } = calculateTenantRentDueToDate({ tenant, today: asOf, rentOverrideMap: overrides, paymentDay });
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
  // Use the same reversal-aware financial projection as reports and payment
  // totals. Tenant dues must not use a second, subtly different payment query.
  // tenantId is the authoritative ownership link; this also retains legacy
  // payment rows whose propertyId was never populated.
  const financialRows = await getFinancialPaymentRows({ db, tenantIds: [tenant._id] });
  const payments = financialRows.map((row) => ({
    ...row.payment,
    amount: row.netAmount,
    postedAmount: row.netAmount,
    allocation: row.payment.allocation || (row.payment.allocationPolicyVersion === "deposit-first-v1" ? undefined : row.allocation),
  })) as LedgerPayment[];
  return deriveTenantFinancialState({
    tenant,
    asOf,
    rentDue,
    monthsStayed,
    utilityBreakdown,
    depositDue,
    overdueRentCharged: overdueRentDue,
    payments,
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
  const otherPaid = state.otherPaid;
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
  const financialRows = await getFinancialPaymentRows({ db, tenantIds: [tenant._id] });
  for (const { payment } of [...financialRows].sort((a, b) =>
    (paymentDateValue(a.payment) ?? 0) - (paymentDateValue(b.payment) ?? 0) ||
    String(a.payment._id).localeCompare(String(b.payment._id))
  )) {
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
      totalOtherPaid: money(otherPaid),
      walletBalance: money(wallet),
      paymentStatus: tenantOverdueStatus(state),
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
    walletApplied: money(state.walletApplied),
    rentDue: state.rentCharged,
    utilityDue: state.utilitiesCharged,
    depositDue: state.depositRequired,
    rentOutstanding,
    utilitiesOutstanding,
    utilitiesCurrentOutstanding: state.utilitiesCurrentOutstanding,
    utilitiesOverdueOutstanding: state.utilitiesOverdueOutstanding,
    utilityStatus: state.utilityStatus,
    penalties: state.penalties,
    overdueAmount: state.overdueAmount,
    depositOutstanding,
    otherOutstanding,
    totalOutstanding,
  };
}

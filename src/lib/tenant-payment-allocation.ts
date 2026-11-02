import { ClientSession, Db, ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
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
  walletAllocation?: Partial<Record<AllocationField, number>>;
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

const money = (value: unknown) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
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
  const paid: Record<AllocationField, number> = { deposit: 0, rent: 0, utilities: 0, other: 0 };
  const due: Record<AllocationField, number> = {
    deposit: amountOf(params.depositDue),
    rent: amountOf(params.rentDue),
    utilities: amountOf(params.utilityDue),
    other: amountOf(params.otherDue),
  };
  const walletLots: Array<{ paymentId: string; remaining: number }> = [];
  const allocations = new Map<string, PaymentAllocation>();

  const applyReceiptFunds = (available: number) => {
    let remaining = amountOf(available);
    const appliedByField: Record<AllocationField, number> = { deposit: 0, rent: 0, utilities: 0, other: 0 };
    for (const field of allocationPriority()) {
      if (remaining <= 0) break;
      const outstanding = money(Math.max(0, due[field] - paid[field]));
      const applied = money(Math.min(outstanding, remaining));
      paid[field] = money(paid[field] + applied);
      appliedByField[field] = applied;
      remaining = money(remaining - applied);
    }
    return { appliedByField, remaining };
  };

  const applyWalletCredit = () => {
    let applied = 0;
    const byField: Record<AllocationField, number> = { deposit: 0, rent: 0, utilities: 0, other: 0 };
    for (const field of allocationPriority()) {
      let outstanding = money(Math.max(0, due[field] - paid[field]));
      if (outstanding <= 0) continue;
      for (const lot of walletLots) {
        if (outstanding <= 0) break;
        if (lot.remaining <= 0) continue;
        const amount = money(Math.min(outstanding, lot.remaining));
        if (amount <= 0) continue;
        const sourceAllocation = allocations.get(lot.paymentId);
        if (!sourceAllocation) continue;
        lot.remaining = money(lot.remaining - amount);
        outstanding = money(outstanding - amount);
        paid[field] = money(paid[field] + amount);
        applied = money(applied + amount);
        byField[field] = money(byField[field] + amount);
        sourceAllocation.walletApplied = money(sourceAllocation.walletApplied + amount);
        sourceAllocation.walletAllocation = {
          ...sourceAllocation.walletAllocation,
          [field]: money((sourceAllocation.walletAllocation?.[field] || 0) + amount),
        };
      }
    }
    return { applied, byField };
  };

  const queueWalletCredit = (paymentId: string, amount: number) => {
    const remaining = amountOf(amount);
    if (remaining > 0) walletLots.push({ paymentId, remaining });
  };

  for (const payment of params.payments.filter((entry) => isSuccessfulPaymentStatus(entry.status))) {
    const paymentAmount = amountOf(payment.amount);
    const paymentId = payment._id.toString();
    let receiptAllocation: Record<AllocationField, number> = { deposit: 0, rent: 0, utilities: 0, other: 0 };
    let walletCredit = 0;

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
        receiptAllocation[field] = accepted;
        paid[field] = money(paid[field] + accepted);
        remainingReceipt = money(remainingReceipt - accepted);
      }
      const fixedWalletCredit = amountOf(payment.allocation.walletCredit);
      walletCredit = money(Math.min(fixedWalletCredit || remainingReceipt, remainingReceipt));
      remainingReceipt = money(remainingReceipt - walletCredit);
      walletCredit = money(walletCredit + remainingReceipt);
      const sourceAllocation: PaymentAllocation = {
        deposit: money(receiptAllocation.deposit),
        rent: money(receiptAllocation.rent),
        utilities: money(receiptAllocation.utilities),
        other: money(receiptAllocation.other),
        walletCredit,
        walletApplied: 0,
        walletAllocation: { deposit: 0, rent: 0, utilities: 0, other: 0 },
      };
      allocations.set(paymentId, sourceAllocation);
      queueWalletCredit(paymentId, walletCredit);
      // Persisted wallet credits are available for today's eligible dues even
      // when there is no newer payment row. The debit remains linked to the
      // original payment that created the wallet credit.
      applyWalletCredit();
      continue;
    }

    const receiptResult = applyReceiptFunds(paymentAmount);
    receiptAllocation = receiptResult.appliedByField;
    walletCredit = receiptResult.remaining;
    const sourceAllocation: PaymentAllocation = {
      deposit: money(receiptAllocation.deposit),
      rent: money(receiptAllocation.rent),
      utilities: money(receiptAllocation.utilities),
      other: money(receiptAllocation.other),
      walletCredit,
      walletApplied: 0,
      walletAllocation: { deposit: 0, rent: 0, utilities: 0, other: 0 },
    };
    allocations.set(paymentId, sourceAllocation);
    // Use older wallet credits after the current receipt, following the same
    // established obligation priority. The source payment stays auditable.
    if (walletLots.some((lot) => lot.remaining > 0) && allocationPriority().some((field) => due[field] - paid[field] > 0)) {
      applyWalletCredit();
    }
    queueWalletCredit(paymentId, walletCredit);
  }

  const wallet = money(walletLots.reduce((sum, lot) => sum + lot.remaining, 0));
  const walletApplied = money([...allocations.values()].reduce((sum, allocation) => sum + amountOf(allocation.walletApplied), 0));
  return {
    depositPaid: money(paid.deposit),
    rentPaid: money(paid.rent),
    utilitiesPaid: money(paid.utilities),
    otherPaid: money(paid.other),
    walletBalance: wallet,
    walletApplied,
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
  options: { asOf?: Date; property?: any; rentOverrideMap?: Map<string, any>; session?: ClientSession } = {}
): Promise<TenantFinancialState> {
  const asOf = options.asOf ?? new Date();
  const propertyId = String(tenant.propertyId || "").trim();
  const property = options.property ?? (propertyId
    ? await db.collection("properties").findOne(
        ObjectId.isValid(propertyId)
          ? { $or: [{ _id: new ObjectId(propertyId) }, { _id: propertyId as any }] }
          : { _id: propertyId as any },
        options.session ? { session: options.session } : undefined,
      )
    : null);
  const overrides = options.rentOverrideMap ?? await fetchActiveRentOverridesByPropertyIds(db, [String(tenant.propertyId)], options.session);
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
    options.session,
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
  const financialRows = await getFinancialPaymentRows({ db, tenantIds: [tenant._id], session: options.session });
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

export async function reconcileTenantPaymentAllocation(db: Db, tenantId: string, options: { session?: ClientSession; lockToken?: string } = {}) {
  if (!ObjectId.isValid(tenantId)) return null;
  if (!options.session && !options.lockToken) {
    const lockToken = randomUUID();
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let acquired = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const claim = await db.collection("tenants").findOneAndUpdate(
        {
          _id: new ObjectId(tenantId),
          $or: [
            { financialAllocationLockAt: { $exists: false } },
            { financialAllocationLockAt: null },
            { financialAllocationLockAt: { $lt: staleBefore } },
          ],
        },
        { $set: { financialAllocationLock: lockToken, financialAllocationLockAt: new Date().toISOString() } },
        { returnDocument: "after" },
      );
      if (claim && ((claim as any).value ?? claim)) {
        acquired = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!acquired) throw new Error("Tenant financial records are being updated. Retry reconciliation shortly.");
    try {
      return await reconcileTenantPaymentAllocation(db, tenantId, { lockToken });
    } finally {
      await db.collection("tenants").updateOne(
        { _id: new ObjectId(tenantId), financialAllocationLock: lockToken },
        { $unset: { financialAllocationLock: "", financialAllocationLockAt: "" } },
      );
    }
  }
  const tenant = await db.collection("tenants").findOne(
    { _id: new ObjectId(tenantId) },
    options.session ? { session: options.session } : undefined,
  );
  if (!tenant) return null;

  const property = ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne(
        { _id: new ObjectId(String(tenant.propertyId)) },
        options.session ? { session: options.session } : undefined,
      )
    : null;
  const today = new Date();
  const state = await calculateTenantFinancialState(db, tenant, { asOf: today, property, session: options.session });
  const allocations = state.paymentAllocations;
  const depositPaid = state.depositPaid;
  const rentPaid = state.rentPaid;
  const utilitiesPaid = state.utilitiesPaid;
  const otherPaid = state.otherPaid;
  const wallet = state.walletBalance;

  const existingWalletEvents = await db.collection("walletTransactions")
    .find({ tenantId: { $in: identityValues(tenant._id) }, kind: "CREDIT_CONSUMED" }, options.session ? { session: options.session } : undefined)
    .toArray();
  const consumedBySourcePayment = new Map<string, number>();
  for (const event of existingWalletEvents) {
    const key = String(event.sourcePaymentId);
    consumedBySourcePayment.set(key, money((consumedBySourcePayment.get(key) || 0) + money(event.amount)));
  }
  const walletLedgerHasReduction = [...consumedBySourcePayment.entries()].some(([paymentId, existingAmount]) =>
    existingAmount > money(allocations.get(paymentId)?.walletApplied || 0) + 0.01
  );

  for (const [paymentId, allocation] of allocations) {
    if (ObjectId.isValid(paymentId)) {
      await db.collection("payments").updateOne(
        { _id: new ObjectId(paymentId) },
        { $set: { allocation } },
        options.session ? { session: options.session } : undefined,
      );
      const expectedConsumed = money(allocation.walletApplied || 0);
      const alreadyConsumed = consumedBySourcePayment.get(paymentId) || 0;
      const incrementalDebit = money(Math.max(0, expectedConsumed - alreadyConsumed));
      if (incrementalDebit > 0 && !walletLedgerHasReduction) {
        const payment = await db.collection("payments").findOne(
          { _id: new ObjectId(paymentId) },
          { projection: { tenantId: 1, propertyId: 1 }, ...(options.session ? { session: options.session } : {}) },
        );
        if (payment) {
          await db.collection("walletTransactions").updateOne(
            { eventKey: `payment:${paymentId}:credit-consumed:${Math.round(expectedConsumed * 100)}` },
            { $setOnInsert: {
              eventKey: `payment:${paymentId}:credit-consumed:${Math.round(expectedConsumed * 100)}`,
              kind: "CREDIT_CONSUMED",
              direction: "DEBIT",
              amount: incrementalDebit,
              cumulativeAmount: expectedConsumed,
              tenantId: payment.tenantId,
              propertyId: payment.propertyId || null,
              sourcePaymentId: new ObjectId(paymentId),
              walletAllocation: {
                deposit: money(allocation.walletAllocation?.deposit),
                rent: money(allocation.walletAllocation?.rent),
                utilities: money(allocation.walletAllocation?.utilities),
                other: money(allocation.walletAllocation?.other),
              },
              reference: payment.providerTransactionId || payment.transactionId || payment.mpesaCode || payment.reference || null,
              reason: "Original payment wallet credit applied to eligible obligations",
              actorRole: "system",
              createdAt: new Date().toISOString(),
            } },
            { upsert: true, ...(options.session ? { session: options.session } : {}) },
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
    .find(
      { tenantId: { $in: identityValues(tenantId) }, status: "posted", ...scopedPropertyFilter(tenant.propertyId) },
      options.session ? { session: options.session } : undefined,
    )
    .sort({ billingPeriod: 1, createdAt: 1, _id: 1 })
    .toArray();
  const chargeRemaining = new Map(utilityCharges.map((charge: any) => [String(charge._id), Math.max(0, Number(charge.amount) || 0)]));
  const financialRows = await getFinancialPaymentRows({ db, tenantIds: [tenant._id], session: options.session });
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
    await db.collection("payments").updateOne(
      { _id: payment._id },
      { $set: { utilityAllocations } },
      options.session ? { session: options.session } : undefined,
    );
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
    } },
    options.session ? { session: options.session } : undefined,
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

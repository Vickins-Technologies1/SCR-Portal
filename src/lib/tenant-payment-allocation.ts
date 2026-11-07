import { ClientSession, Db, ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { calculateFixedUtilityBreakdown, getPostedMeteredUtilityBreakdown, UtilityDueBreakdown } from "@/lib/property-utilities";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateOverduePenalty, calculateTenantRentDueToDate, resolveTenantRequiredDeposit } from "@/lib/utils";
import { getFinancialPaymentRows, type FinancialPaymentRow } from "@/lib/financial-reporting";
import { identityValues, isSuccessfulPaymentStatus, paymentEventDate } from "@/lib/payment-query";
import { businessDateKey, businessDateParts } from "@/lib/business-time";
import { getManualTenantInvoiceChargeObligations } from "@/lib/tenant-invoices";

export type PaymentAllocation = {
  deposit: number;
  rent: number;
  utilities: number;
  other: number;
  walletCredit: number;
  walletCreditCategory?: AllocationField;
  walletCreditCategories?: AllocationField[];
  walletApplied: number;
  walletAllocation?: Partial<Record<AllocationField, number>>;
  utilityAllocations?: Array<{ utilityChargeId: string; billingPeriod: string; amount: number }>;
};

export type PaymentCategory = "Rent" | "Utility" | "RentAndUtility" | "Deposit" | "Other" | "General";

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
  tenantInvoiceId?: string;
  invoicePriority?: AllocationField[];
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
  otherOutstanding: number;
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
  rentObligations: Array<{ billingPeriod: string; amount: number; paid: number; outstanding: number; dueDate: Date; overdue: boolean }>;
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

export function sumTenantDepositOutstanding(states: Iterable<Pick<TenantFinancialState, "depositOutstanding">>) {
  let total = 0;
  for (const state of states) total += amountOf(state.depositOutstanding);
  return money(total);
}

export function sumTenantOverdueAmount(
  states: Iterable<Pick<TenantFinancialState, "overdueAmount">>
) {
  let total = 0;
  for (const state of states) total += amountOf(state.overdueAmount);
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

/** Convert the shared financial projection to tenant-ledger inputs. */
export function mapFinancialRowsToLedgerPayments(rows: FinancialPaymentRow[]): LedgerPayment[] {
  return rows.map((row) => ({
    ...row.payment,
    amount: row.netAmount,
    postedAmount: row.netAmount,
    // The financial projection already prorates a persisted allocation after
    // reversals. Preserve the legacy policy fallback for old v1 rows that have
    // no stored allocation, but do not reintroduce the unreversed snapshot.
    allocation: row.payment.allocation
      ? row.allocation
      : row.payment.allocationPolicyVersion === "deposit-first-v1" || row.payment.allocationPolicyVersion === "category-directed-v2" || row.payment.type === "RentAndUtility"
        ? undefined
        : row.allocation,
  })) as LedgerPayment[];
}

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
  const walletLots: Array<{ paymentId: string; remaining: number; allowedFields?: AllocationField[] }> = [];
  const allocations = new Map<string, PaymentAllocation>();

  const applyReceiptFunds = (available: number, fields = allocationPriority()) => {
    let remaining = amountOf(available);
    const appliedByField: Record<AllocationField, number> = { deposit: 0, rent: 0, utilities: 0, other: 0 };
    for (const field of fields) {
      if (remaining <= 0) break;
      const outstanding = money(Math.max(0, due[field] - paid[field]));
      const applied = money(Math.min(outstanding, remaining));
      paid[field] = money(paid[field] + applied);
      appliedByField[field] = applied;
      remaining = money(remaining - applied);
    }
    return { appliedByField, remaining };
  };

  const applyTypedReceiptFunds = (payment: LedgerPayment, amount: number) => {
    const legacyDepositFirst = payment.allocationPolicyVersion === "deposit-first-v1";
    if (legacyDepositFirst || payment.type === "General" || !payment.type) {
      return applyReceiptFunds(amount);
    }
    if (payment.type === "RentAndUtility") {
      return applyReceiptFunds(amount, ["rent", "utilities"]);
    }

    const fieldByType: Partial<Record<PaymentCategory, AllocationField>> = {
      Deposit: "deposit",
      Rent: "rent",
      Utility: "utilities",
      Other: "other",
    };
    const field = fieldByType[payment.type];
    if (!field) return applyReceiptFunds(amount, []);

    // A security-deposit receipt remains a deposit collection even when it
    // exceeds today's obligation. It must not be reclassified as rent or
    // utilities, and the outstanding deposit balance is capped separately.
    if (field === "deposit") {
      const appliedByField: Record<AllocationField, number> = { deposit: amountOf(amount), rent: 0, utilities: 0, other: 0 };
      paid.deposit = money(paid.deposit + appliedByField.deposit);
      return { appliedByField, remaining: 0 };
    }

    return applyReceiptFunds(amount, [field]);
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
        if (lot.allowedFields && !lot.allowedFields.includes(field)) continue;
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

  const queueWalletCredit = (paymentId: string, amount: number, allowedFields?: AllocationField[]) => {
    const remaining = amountOf(amount);
    if (remaining > 0) walletLots.push({ paymentId, remaining, allowedFields });
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
      const walletCreditCategory = payment.allocation.walletCreditCategory;
      const walletCreditCategories = Array.isArray(payment.allocation.walletCreditCategories)
        ? payment.allocation.walletCreditCategories.filter((field): field is AllocationField => ["deposit", "rent", "utilities", "other"].includes(field))
        : undefined;
      const walletAllowedFields = walletCreditCategories?.length ? walletCreditCategories : walletCreditCategory ? [walletCreditCategory] : undefined;
      const sourceAllocation: PaymentAllocation = {
        deposit: money(receiptAllocation.deposit),
        rent: money(receiptAllocation.rent),
        utilities: money(receiptAllocation.utilities),
        other: money(receiptAllocation.other),
        walletCredit,
        ...(walletCreditCategory ? { walletCreditCategory } : {}),
        ...(walletAllowedFields && walletCreditCategories?.length ? { walletCreditCategories: walletAllowedFields } : {}),
        walletApplied: 0,
        walletAllocation: { deposit: 0, rent: 0, utilities: 0, other: 0 },
      };
      allocations.set(paymentId, sourceAllocation);
      queueWalletCredit(paymentId, walletCredit, walletAllowedFields);
      // Persisted wallet credits are available for today's eligible dues even
      // when there is no newer payment row. The debit remains linked to the
      // original payment that created the wallet credit.
      applyWalletCredit();
      continue;
    }

    const receiptResult = payment.tenantInvoiceId && payment.invoicePriority?.length
      ? applyReceiptFunds(paymentAmount, [...payment.invoicePriority, ...allocationPriority().filter((field) => !payment.invoicePriority!.includes(field))])
      : applyTypedReceiptFunds(payment, paymentAmount);
    receiptAllocation = receiptResult.appliedByField;
    walletCredit = receiptResult.remaining;
    const walletCreditCategories: AllocationField[] | undefined = walletCredit > 0 && payment.type === "RentAndUtility"
      ? ["rent", "utilities"]
      : undefined;
    const sourceAllocation: PaymentAllocation = {
      deposit: money(receiptAllocation.deposit),
      rent: money(receiptAllocation.rent),
      utilities: money(receiptAllocation.utilities),
      other: money(receiptAllocation.other),
      walletCredit,
      ...(walletCreditCategories ? { walletCreditCategories } : {}),
      ...(walletCredit > 0 && !walletCreditCategories && payment.type && payment.type !== "General" && payment.type !== "Deposit"
        ? { walletCreditCategory: payment.type === "Utility" ? "utilities" : payment.type.toLowerCase() as AllocationField }
        : {}),
      walletApplied: 0,
      walletAllocation: { deposit: 0, rent: 0, utilities: 0, other: 0 },
    };
    allocations.set(paymentId, sourceAllocation);
    // Use older wallet credits after the current receipt, following the same
    // established obligation priority. The source payment stays auditable.
    if (walletLots.some((lot) => lot.remaining > 0) && allocationPriority().some((field) => due[field] - paid[field] > 0)) {
      applyWalletCredit();
    }
    queueWalletCredit(
      paymentId,
      walletCredit,
      sourceAllocation.walletCreditCategories || (sourceAllocation.walletCreditCategory ? [sourceAllocation.walletCreditCategory] : undefined),
    );
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
  otherDue?: number;
  overdueRentCharged?: number;
  rentObligations?: Array<{ billingPeriod: string; amount: number; dueDate: Date; overdue: boolean }>;
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
      return date !== null && date <= cutoff;
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
    otherDue: params.otherDue || 0,
    walletBalance: 0,
    payments: eligiblePayments,
  });
  const utilityOverdueCharged = money(params.utilityBreakdown.overdueCharged);
  let unappliedRentPaid = ledger.rentPaid;
  const rentObligations = (params.rentObligations || []).map((obligation) => {
    const amount = money(obligation.amount);
    const paid = money(Math.min(amount, unappliedRentPaid));
    unappliedRentPaid = money(unappliedRentPaid - paid);
    return { ...obligation, amount, paid, outstanding: money(amount - paid) };
  });
  const overdueRent = rentObligations.length
    ? money(rentObligations.reduce((sum, obligation) => sum + (obligation.overdue ? obligation.outstanding : 0), 0))
    : money(Math.max(0, money(params.overdueRentCharged ?? params.rentDue) - ledger.rentPaid));
  const penalties = money(calculateOverduePenalty({
    rentDues: overdueRent,
    today: params.asOf,
    rentPaymentDate: params.property?.rentPaymentDate,
    leaseStartDate: params.tenant.leaseStartDate,
    penaltyAmount: params.property?.penaltyAmount,
    penaltyFrequency: params.property?.penaltyFrequency,
  }));
  const depositOutstanding = money(Math.max(0, params.depositDue - ledger.depositPaid));
  const otherOutstanding = money(Math.max(0, money(params.otherDue) - ledger.otherPaid));
  const rentOutstanding = money(Math.max(0, params.rentDue - ledger.rentPaid));
  const utilitiesOutstanding = money(Math.max(0, params.utilityBreakdown.charged - ledger.utilitiesPaid));
  const utilityObligations = [...(params.utilityBreakdown.obligations || [])]
    .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod) || (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  let unappliedUtilitiesPaid = ledger.utilitiesPaid;
  const utilityOutstandingByPeriod = utilityObligations.map((obligation) => {
    const paid = money(Math.min(obligation.amount, unappliedUtilitiesPaid));
    unappliedUtilitiesPaid = money(unappliedUtilitiesPaid - paid);
    return { ...obligation, outstanding: money(obligation.amount - paid) };
  });
  const overdueUtilitiesCalculated = utilityObligations.length
    ? money(utilityOutstandingByPeriod.reduce((sum, obligation) => sum + (obligation.overdue ? obligation.outstanding : 0), 0))
    : Math.max(0, utilityOverdueCharged - ledger.utilitiesPaid);
  const utilitiesOverdueOutstanding = money(Math.min(utilitiesOutstanding, overdueUtilitiesCalculated));
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
    otherOutstanding,
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
    totalOutstanding: money(depositOutstanding + rentOutstanding + utilitiesOutstanding + otherOutstanding + penalties),
    walletBalance: ledger.walletBalance,
    walletApplied: ledger.walletApplied,
    paymentAllocations: ledger.allocations,
    rentObligations,
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
  const { rentDue: baseRentDue, overdueRentDue, monthsStayed, obligations: baseRentObligations } = calculateTenantRentDueToDate({ tenant, today: asOf, rentOverrideMap: overrides, paymentDay });
  const manualInvoiceObligations = await getManualTenantInvoiceChargeObligations(db, String(tenant._id), String(tenant.propertyId), asOf);
  const manualRent = manualInvoiceObligations.reduce((sum, invoice) => sum + invoice.categories.rent, 0) / 100;
  const manualUtilities = manualInvoiceObligations.reduce((sum, invoice) => sum + invoice.categories.utilities, 0) / 100;
  const manualDeposit = manualInvoiceObligations.reduce((sum, invoice) => sum + invoice.categories.deposit, 0) / 100;
  const manualOther = manualInvoiceObligations.reduce((sum, invoice) => sum + invoice.categories.penalty + invoice.categories.other, 0) / 100;
  const rentDue = money(baseRentDue + manualRent);
  const rentObligations = [
    ...baseRentObligations,
    ...manualInvoiceObligations.filter((invoice) => invoice.categories.rent > 0).map((invoice) => ({
      billingPeriod: `MANUAL-${invoice.invoiceId}`,
      amount: invoice.categories.rent / 100,
      dueDate: invoice.dueDate,
      overdue: businessDateKey(invoice.dueDate) < businessDateKey(asOf),
    })),
  ];
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
    tenant.leaseEndDate,
  );
  const utilityBreakdown: UtilityDueBreakdown = {
    charged: money(fixedUtilities.charged + meteredUtilities.charged + manualUtilities),
    currentCharged: money(fixedUtilities.currentCharged + meteredUtilities.currentCharged + manualInvoiceObligations.filter((invoice) => businessDateKey(invoice.dueDate) >= businessDateKey(asOf)).reduce((sum, invoice) => sum + invoice.categories.utilities / 100, 0)),
    overdueCharged: money(fixedUtilities.overdueCharged + meteredUtilities.overdueCharged + manualInvoiceObligations.filter((invoice) => businessDateKey(invoice.dueDate) < businessDateKey(asOf)).reduce((sum, invoice) => sum + invoice.categories.utilities / 100, 0)),
    obligations: [
      ...(fixedUtilities.obligations || []), ...(meteredUtilities.obligations || []),
      ...manualInvoiceObligations.filter((invoice) => invoice.categories.utilities > 0).map((invoice) => ({ billingPeriod: `MANUAL-${invoice.invoiceId}`, amount: invoice.categories.utilities / 100, dueDate: invoice.dueDate, overdue: businessDateKey(invoice.dueDate) < businessDateKey(asOf) })),
    ],
  };
  const depositDue = money(resolveTenantRequiredDeposit({ tenant, unitTypes: property?.unitTypes }) + manualDeposit);
  // Use reversal-aware rows linked to this tenant and lease property. Keep
  // legacy rows with no property (or a deleted property), but do not let a
  // payment explicitly linked to another existing property reduce these dues.
  const paymentPropertyId = property?._id ?? tenant.propertyId;
  const financialRows = await getFinancialPaymentRows({
    db,
    tenantIds: [tenant._id],
    ...(paymentPropertyId ? {
      propertyIds: [paymentPropertyId],
      tenantIdsForUnresolvedProperty: [tenant._id],
    } : {}),
    session: options.session,
  });
  const payments = mapFinancialRowsToLedgerPayments(financialRows);
  const targetedInvoiceIds = [...new Set(payments.map((payment) => String(payment.tenantInvoiceId || "")).filter((id) => ObjectId.isValid(id)))];
  const targetedInvoices = targetedInvoiceIds.length ? await db.collection("tenantInvoices").find({ _id: { $in: targetedInvoiceIds.map((id) => new ObjectId(id)) } }).toArray() : [];
  const priorityByInvoice = new Map(targetedInvoices.map((invoice: any) => {
    const categories: AllocationField[] = [];
    for (const item of invoice.items || []) {
      const field = item.category === "utilities" ? "utilities" : item.category === "deposit" ? "deposit" : item.category === "penalty" || item.category === "other" ? "other" : "rent";
      if (!categories.includes(field)) categories.push(field);
    }
    for (const adjustment of invoice.adjustments || []) {
      const field = adjustment.category === "utilities" ? "utilities" : adjustment.category === "deposit" ? "deposit" : adjustment.category === "penalty" || adjustment.category === "other" ? "other" : "rent";
      if (!categories.includes(field)) categories.push(field);
    }
    return [String(invoice._id), categories];
  }));
  for (const payment of payments) if (payment.tenantInvoiceId) payment.invoicePriority = priorityByInvoice.get(String(payment.tenantInvoiceId));
  return deriveTenantFinancialState({
    tenant,
    asOf,
    rentDue,
    monthsStayed,
    utilityBreakdown,
    depositDue,
    otherDue: manualOther,
    overdueRentCharged: overdueRentDue,
    rentObligations,
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
      // Posted payment allocations are historical financial records. Only the
      // payment currently being finalized (with an active posting claim) may
      // receive its first allocation snapshot here.
      const currentPayment = await db.collection("payments").findOne(
        { _id: new ObjectId(paymentId) },
        { projection: { financialPostingClaim: 1, financialPostingStatus: 1, utilityAllocations: 1 }, ...(options.session ? { session: options.session } : {}) },
      );
      if (currentPayment?.financialPostingClaim && currentPayment.financialPostingStatus === "processing") {
        await db.collection("payments").updateOne(
          { _id: new ObjectId(paymentId), financialPostingStatus: "processing", allocation: { $exists: false } },
          { $set: { allocation } },
          options.session ? { session: options.session } : undefined,
        );
      }
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
  const financialRows = await getFinancialPaymentRows({
    db,
    tenantIds: [tenant._id],
    ...(tenant.propertyId ? {
      propertyIds: [tenant.propertyId],
      tenantIdsForUnresolvedProperty: [tenant._id],
    } : {}),
    session: options.session,
  });
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
    const currentPayment = await db.collection("payments").findOne(
      { _id: payment._id },
      { projection: { financialPostingClaim: 1, financialPostingStatus: 1, utilityAllocations: 1 }, ...(options.session ? { session: options.session } : {}) },
    );
    if (currentPayment?.financialPostingClaim && currentPayment.financialPostingStatus === "processing" && !Array.isArray(currentPayment.utilityAllocations)) {
      await db.collection("payments").updateOne(
        { _id: payment._id, financialPostingStatus: "processing", utilityAllocations: { $exists: false } },
        { $set: { utilityAllocations } },
        options.session ? { session: options.session } : undefined,
      );
    }
  }

  const rentOutstanding = state.rentOutstanding;
  const utilitiesOutstanding = state.utilitiesOutstanding;
  const depositOutstanding = state.depositOutstanding;
  const otherOutstanding = state.otherOutstanding;
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
    financialState: state,
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

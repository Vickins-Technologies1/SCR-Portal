import "server-only";
import { Db } from "mongodb";
import { calculateTenantFinancialState, type TenantFinancialState } from "@/lib/tenant-payment-allocation";
import { addInvoicePaymentStates, invoiceCategoryTotals } from "@/lib/tenant-invoices";
import { identityValues } from "@/lib/payment-query";
import { getTenantUtilityUnitCount, getUtilityDueDate, toBillingPeriod } from "@/lib/property-utilities";

export type TenantDueObligation = {
  reference: string;
  chargeType: "rent" | "utilities" | "other";
  description: string;
  billingPeriod: string;
  originalAmountMinor: number;
  amountPaidMinor: number;
  amountAllocatedMinor: number;
  outstandingMinor: number;
  dueDate: Date;
  overdueDays: number;
  eligible: boolean;
};

export type TenantInvoiceDues = {
  tenantId: string;
  propertyId: string;
  rentMinor: number;
  utilitiesMinor: number;
  otherMinor: number;
  totalMinor: number;
  overdueRentMinor: number;
  overdueUtilitiesMinor: number;
  overdueAmountMinor: number;
  walletBalanceMinor: number;
  lines: Array<{ description: string; quantity: number; unitAmount: number; amount: number; category: "rent" | "utilities" | "other"; dueDate: Date; obligationRef: string; billingPeriod: string; originalAmountMinor: number; amountPaidMinor: number; amountAllocatedMinor: number; overdueDays: number }>;
  obligations: TenantDueObligation[];
  paymentsAllocatedMinor: number;
  existingInvoiceIds: string[];
  existingInvoiceBalanceMinor: number;
};

const moneyMinor = (amount: unknown) => Math.max(0, Math.round(Number(amount || 0) * 100));
const businessDay = (date: Date) => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)).getTime();

/** Ledger-derived obligations, allocated oldest-first in the same category order as tenant payments. */
export async function calculateTenantInvoiceDues(db: Db, tenant: any, property: any, asOf = new Date(), options: { excludeInvoiceIds?: string[]; financialState?: TenantFinancialState } = {}): Promise<TenantInvoiceDues> {
  const state = options.financialState ?? await calculateTenantFinancialState(db, tenant, { asOf, property });
  const obligations: TenantDueObligation[] = [];
  let fallbackRentPaidLeft = moneyMinor(state.rentPaid);
  for (const rent of [...(state.rentObligations || [])].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
    const originalAmountMinor = moneyMinor(rent.amount);
    // The shared financial state has already applied net payments, explicit
    // historical category allocations, and reversals. Reuse its obligation
    // projection instead of re-spreading aggregate rent paid a second time.
    const hasSharedAllocation = Number.isFinite(Number(rent.outstanding)) && Number.isFinite(Number(rent.paid));
    const amountPaidMinor = hasSharedAllocation ? Math.min(originalAmountMinor, moneyMinor(rent.paid)) : Math.min(originalAmountMinor, fallbackRentPaidLeft);
    fallbackRentPaidLeft = Math.max(0, fallbackRentPaidLeft - amountPaidMinor);
    const outstandingMinor = hasSharedAllocation ? moneyMinor(rent.outstanding) : originalAmountMinor - amountPaidMinor;
    const overdueDays = Math.max(0, Math.floor((businessDay(asOf) - businessDay(rent.dueDate)) / 86_400_000));
    obligations.push({ reference: `rent:${rent.billingPeriod}`, chargeType: "rent", description: `Rent arrears — ${rent.billingPeriod}`, billingPeriod: rent.billingPeriod, originalAmountMinor, amountPaidMinor, amountAllocatedMinor: amountPaidMinor, outstandingMinor, dueDate: rent.dueDate, overdueDays, eligible: rent.overdue && outstandingMinor > 0 });
  }

  const chargeRows = await db.collection("utilityCharges").find({ tenantId: { $in: identityValues(tenant._id) }, status: "posted", $or: [{ propertyId: { $in: identityValues(property._id) } }, { propertyId: { $exists: false } }, { propertyId: null }] } as any).sort({ dueDate: 1, billingPeriod: 1, createdAt: 1, _id: 1 }).toArray();
  const utilityObligations: Array<{ reference: string; description: string; billingPeriod: string; amount: number; dueDate: Date }> = [];
  const unitCount = getTenantUtilityUnitCount(tenant);
  const leaseStart = tenant.leaseStartDate ? new Date(tenant.leaseStartDate) : null;
  const currentPeriod = toBillingPeriod(asOf);
  const paymentDay = Number(property.rentPaymentDate) || 1;
  for (const utility of property.utilities || []) {
    if (!utility || utility.active === false || utility.billingMode !== "fixed" || !leaseStart || unitCount <= 0) continue;
    const configuredStart = utility.startsAt ? new Date(utility.startsAt) : null;
    const starts = configuredStart && configuredStart > leaseStart ? configuredStart : leaseStart;
    const startPeriod = toBillingPeriod(starts);
    let cursor = startPeriod;
    while (cursor <= currentPeriod) {
      const [year, month] = cursor.split("-").map(Number);
      const dueDate = getUtilityDueDate(cursor, paymentDay);
      utilityObligations.push({ reference: `utility-fixed:${String(utility.id)}:${cursor}`, description: String(utility.name || "Fixed utility"), billingPeriod: cursor, amount: Math.max(0, Number(utility.amount) || 0) * unitCount, dueDate: dueDate || new Date(Date.UTC(year, month - 1, paymentDay)) });
      const next = new Date(Date.UTC(year, month, 1));
      cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    }
  }
  for (const charge of chargeRows) {
    const period = String(charge.billingPeriod || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > currentPeriod) continue;
    const dueDate = charge.dueDate ? new Date(charge.dueDate) : getUtilityDueDate(period, paymentDay);
    if (!dueDate || Number.isNaN(dueDate.getTime())) continue;
    utilityObligations.push({ reference: `utility:${String(charge._id)}`, description: String(charge.utilityName || "Utility"), billingPeriod: period, amount: Number(charge.amount) || 0, dueDate });
  }
  utilityObligations.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.billingPeriod.localeCompare(b.billingPeriod) || a.reference.localeCompare(b.reference));
  let utilityPaidLeft = moneyMinor(state.utilitiesPaid);
  for (const charge of utilityObligations) {
    const dueDate = charge.dueDate;
    const originalAmountMinor = moneyMinor(charge.amount);
    const amountPaidMinor = Math.min(originalAmountMinor, utilityPaidLeft);
    utilityPaidLeft -= amountPaidMinor;
    const outstandingMinor = originalAmountMinor - amountPaidMinor;
    const overdueDays = Number.isFinite(dueDate.getTime()) ? Math.max(0, Math.floor((businessDay(asOf) - businessDay(dueDate)) / 86_400_000)) : 0;
    obligations.push({ reference: charge.reference, chargeType: "utilities", description: `${charge.description} — ${charge.billingPeriod}`, billingPeriod: charge.billingPeriod, originalAmountMinor, amountPaidMinor, amountAllocatedMinor: amountPaidMinor, outstandingMinor, dueDate, overdueDays, eligible: overdueDays > 0 && outstandingMinor > 0 });
  }

  const penaltyMinor = moneyMinor(state.penalties);
  if (penaltyMinor > 0 && state.overdueRent > 0) {
    obligations.push({ reference: `penalty:${tenant._id}:${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(asOf)}`, chargeType: "other", description: "Overdue rent penalty", billingPeriod: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(asOf), originalAmountMinor: penaltyMinor, amountPaidMinor: 0, amountAllocatedMinor: 0, outstandingMinor: penaltyMinor, dueDate: asOf, overdueDays: 0, eligible: true });
  }

  const eligible = obligations.filter((obligation) => obligation.eligible);
  const invoices = await db.collection("tenantInvoices").find({ tenantId: { $in: identityValues(tenant._id) }, propertyId: { $in: identityValues(property._id) }, status: { $in: ["issued", "partially_paid", "paid", "overdue"] }, ...(options.excludeInvoiceIds?.length ? { _id: { $nin: options.excludeInvoiceIds } } : {}) } as any).toArray();
  const calculated = await addInvoicePaymentStates(db, invoices);
  const coveredRefs = new Set<string>();
  const coveredByCategory = { rent: 0, utilities: 0, other: 0 };
  const existingInvoiceIds: string[] = [];
  let existingInvoiceBalanceMinor = 0;
  let overdueInvoiceRentMinor = 0;
  let overdueInvoiceUtilitiesMinor = 0;
  const walletRemaining = { rent: 0, utilities: 0, other: 0 };
  for (const allocation of state.paymentAllocations?.values?.() || []) {
    walletRemaining.rent += moneyMinor(allocation.walletAllocation?.rent);
    walletRemaining.utilities += moneyMinor(allocation.walletAllocation?.utilities);
    walletRemaining.other += moneyMinor(allocation.walletAllocation?.other);
  }
  const orderedInvoices = [...calculated].sort((a, b) => String(a.billingPeriod || a.issueDate || "").localeCompare(String(b.billingPeriod || b.issueDate || "")) || String(a._id).localeCompare(String(b._id)));
  for (const invoice of orderedInvoices) {
    const balance = Math.max(0, Number(invoice.balanceMinor) || 0);
    if (!balance) continue;
    existingInvoiceIds.push(String(invoice._id));
    existingInvoiceBalanceMinor += balance;
    const totals = invoiceCategoryTotals(invoice);
    const paidByCategory = { rent: 0, utilities: 0, other: 0 };
    for (const allocation of invoice.paymentAllocations || []) {
      if (allocation.category in paidByCategory) {
        paidByCategory[allocation.category as keyof typeof paidByCategory] += Math.max(0, Number(allocation.amountMinor) || 0);
      }
    }
    const overdueInvoiceOpen = { rent: 0, utilities: 0, other: 0 };
    for (const category of ["rent", "utilities", "other"] as const) {
      const unpaid = Math.max(0, totals[category] - paidByCategory[category]);
      const walletApplied = Math.min(unpaid, walletRemaining[category]);
      walletRemaining[category] -= walletApplied;
      overdueInvoiceOpen[category] = unpaid - walletApplied;
    }
    const invoiceDueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (invoiceDueDate && Number.isFinite(invoiceDueDate.getTime()) && businessDay(invoiceDueDate) < businessDay(asOf)) {
      overdueInvoiceRentMinor += overdueInvoiceOpen.rent;
      overdueInvoiceUtilitiesMinor += overdueInvoiceOpen.utilities;
    }
    for (const ref of invoice.obligationRefs || []) coveredRefs.add(String(ref));
    if (!(invoice.obligationRefs || []).length) {
      for (const category of ["rent", "utilities", "other"] as const) coveredByCategory[category] += overdueInvoiceOpen[category];
    }
  }
  const coveredLeft = { ...coveredByCategory };
  const evaluated = eligible.map((obligation) => {
    if (coveredRefs.has(obligation.reference)) return { ...obligation, outstandingMinor: 0, eligible: false };
    const bucket = obligation.chargeType;
    const covered = Math.min(obligation.outstandingMinor, coveredLeft[bucket]);
    coveredLeft[bucket] -= covered;
    return { ...obligation, outstandingMinor: obligation.outstandingMinor - covered, eligible: obligation.outstandingMinor - covered > 0 };
  });
  const proposed = evaluated.filter((obligation) => obligation.eligible);
  const rentMinor = proposed.filter((item) => item.chargeType === "rent").reduce((sum, item) => sum + item.outstandingMinor, 0);
  const utilitiesMinor = proposed.filter((item) => item.chargeType === "utilities").reduce((sum, item) => sum + item.outstandingMinor, 0);
  const otherMinor = proposed.filter((item) => item.chargeType === "other").reduce((sum, item) => sum + item.outstandingMinor, 0);
  const overdueRentMinor = proposed.filter((item) => item.chargeType === "rent").reduce((sum, item) => sum + item.outstandingMinor, 0) + overdueInvoiceRentMinor;
  const overdueUtilitiesMinor = proposed.filter((item) => item.chargeType === "utilities").reduce((sum, item) => sum + item.outstandingMinor, 0) + overdueInvoiceUtilitiesMinor;
  const lines = proposed.map((item) => ({ description: `${item.description} · ${item.billingPeriod} · original KES ${(item.originalAmountMinor / 100).toFixed(2)} · paid KES ${(item.amountPaidMinor / 100).toFixed(2)} · due ${item.dueDate.toISOString().slice(0, 10)}`, quantity: 1, unitAmount: item.outstandingMinor, amount: item.outstandingMinor, category: item.chargeType, dueDate: item.dueDate, obligationRef: item.reference, billingPeriod: item.billingPeriod, originalAmountMinor: item.originalAmountMinor, amountPaidMinor: item.amountPaidMinor, amountAllocatedMinor: item.amountAllocatedMinor, overdueDays: item.overdueDays }));
  return { tenantId: String(tenant._id), propertyId: String(property._id), rentMinor, utilitiesMinor, otherMinor, totalMinor: rentMinor + utilitiesMinor + otherMinor, overdueRentMinor, overdueUtilitiesMinor, overdueAmountMinor: overdueRentMinor + overdueUtilitiesMinor, walletBalanceMinor: moneyMinor(state.walletBalance), lines, obligations: [...obligations.filter((item) => !item.eligible), ...evaluated], paymentsAllocatedMinor: moneyMinor(state.rentPaid + state.utilitiesPaid + state.depositPaid + state.otherPaid), existingInvoiceIds, existingInvoiceBalanceMinor };
}

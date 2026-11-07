import { ClientSession, Db, ObjectId } from "mongodb";
import { calculateInvoiceTotals, type InvoiceCalculation } from "@/lib/invoice-calculations";
import {
  eligibleFinancialPaymentFilter,
  identityFilter,
  identityValues,
  money,
  paymentAmount,
  paymentDateRangeFilter,
  paymentEventDate,
  prorateAllocation,
} from "@/lib/payment-query";

export type FinancialReportSummary = {
  totalReceived: number;
  rentReceived: number;
  utilityReceived: number;
  depositReceived: number;
  otherReceived: number;
  unappliedCredit: number;
  netReceived: number;
  legacyUnallocatedPayments: number;
};

export type FinancialPaymentRow = {
  payment: any;
  eventDate: Date | null;
  originalAmount: number;
  reversedAmount: number;
  netAmount: number;
  allocation: {
    rent: number;
    utilities: number;
    deposit: number;
    other: number;
    walletCredit: number;
    walletCreditCategory?: "deposit" | "rent" | "utilities" | "other";
    walletCreditCategories?: Array<"deposit" | "rent" | "utilities" | "other">;
  };
};

export type FinancialPaymentAllocation = FinancialPaymentRow["allocation"];

export type CategorizedFinancialPaymentRow = {
  row: FinancialPaymentRow;
  type: "Rent" | "Utility" | "Deposit" | "Other" | "Wallet Credit";
  amount: number;
};

/**
 * Summarize posted payment rows, optionally replacing persisted allocation
 * snapshots with the current tenant-ledger projection. Repeated copies of the
 * same payment document are ignored; distinct payment documents remain
 * separate even when a provider reference was reused by legacy records.
 */
export function summarizeFinancialPaymentRows(
  rows: FinancialPaymentRow[],
): FinancialReportSummary {
  const summary: FinancialReportSummary = {
    totalReceived: 0,
    rentReceived: 0,
    utilityReceived: 0,
    depositReceived: 0,
    otherReceived: 0,
    unappliedCredit: 0,
    netReceived: 0,
    legacyUnallocatedPayments: 0,
  };
  const seenPaymentIds = new Set<string>();

  for (const row of rows) {
    const paymentId = String(row.payment?._id ?? "");
    if (paymentId && seenPaymentIds.has(paymentId)) continue;
    if (paymentId) seenPaymentIds.add(paymentId);

    const allocation = row.allocation;
    summary.totalReceived += row.originalAmount;
    summary.netReceived += row.netAmount;
    summary.rentReceived += allocation.rent || 0;
    summary.utilityReceived += allocation.utilities || 0;
    summary.depositReceived += allocation.deposit || 0;
    summary.otherReceived += allocation.other || 0;
    summary.unappliedCredit += allocation.walletCredit || 0;
    if (!row.payment.allocation && !row.payment.type) summary.legacyUnallocatedPayments += row.netAmount;
  }

  for (const key of Object.keys(summary) as Array<keyof FinancialReportSummary>) {
    summary[key] = money(summary[key]);
  }
  return summary;
}

export function summarizeFinancialPaymentPeriods<T extends { key: string; start: Date; end: Date }>(
  rows: FinancialPaymentRow[],
  periods: T[],
) {
  return periods.map((period) => ({
    ...period,
    summary: summarizeFinancialPaymentRows(
      rows.filter((row) => row.eventDate && row.eventDate >= period.start && row.eventDate <= period.end),
    ),
  }));
}

/** Split a receipt across its ledger categories for detailed financial reports. */
export function categorizeFinancialPaymentRows(
  rows: FinancialPaymentRow[],
): CategorizedFinancialPaymentRow[] {
  const seenPaymentIds = new Set<string>();
  const categorized: CategorizedFinancialPaymentRow[] = [];
  const categories = [
    ["Rent", "rent"],
    ["Utility", "utilities"],
    ["Deposit", "deposit"],
    ["Other", "other"],
    ["Wallet Credit", "walletCredit"],
  ] as const;

  for (const row of rows) {
    const paymentId = String(row.payment?._id ?? "");
    if (paymentId && seenPaymentIds.has(paymentId)) continue;
    if (paymentId) seenPaymentIds.add(paymentId);
    const allocation = row.allocation;
    for (const [type, field] of categories) {
      const amount = money(allocation[field]);
      if (amount > 0) categorized.push({ row, type, amount });
    }
  }
  return categorized;
}

function reversalIdentityValues(paymentIds: any[]) {
  return paymentIds.flatMap((paymentId) => identityValues(paymentId));
}

export function projectFinancialPaymentRows(payments: any[], reversalRows: Array<{ _id: any; total: number }>): FinancialPaymentRow[] {
  const reversedByPayment = new Map(reversalRows.map((row) => [String(row._id), money(row.total)]));

  return payments.map((payment) => {
    const originalAmount = paymentAmount(payment);
    const reversedAmount = reversedByPayment.get(String(payment._id)) || 0;
    const netAmount = money(Math.max(0, originalAmount - reversedAmount));
    const storedAllocation = payment.allocation
      ? prorateAllocation(payment.allocation, originalAmount, netAmount)
      : null;
    const allocation = storedAllocation || (payment.allocationPolicyVersion
      ? { rent: 0, utilities: 0, deposit: 0, other: 0, walletCredit: netAmount }
      : {
          rent: payment.type === "Rent" ? netAmount : 0,
          utilities: payment.type === "Utility" ? netAmount : 0,
          deposit: payment.type === "Deposit" ? netAmount : 0,
          other: payment.type === "Other" ? netAmount : 0,
          walletCredit: !payment.type || payment.type === "General" ? netAmount : 0,
        });

    return {
      payment,
      eventDate: paymentEventDate(payment),
      originalAmount,
      reversedAmount,
      netAmount,
      allocation,
    };
  });
}

/**
 * Read the authoritative financial payment set once. This deliberately
 * accepts legacy successful statuses and both string/ObjectId references,
 * then applies posted reversals without mutating the source payment.
 */
export async function getFinancialPaymentRows(params: {
  db: Db;
  propertyIds?: Array<string | ObjectId>;
  tenantIds?: Array<string | ObjectId>;
  /** Include tenant-linked receipts whose property is missing or no longer resolves. */
  tenantIdsForUnresolvedProperty?: Array<string | ObjectId>;
  invoiceIds?: Array<string | ObjectId>;
  start?: Date;
  end?: Date;
  session?: ClientSession;
}): Promise<FinancialPaymentRow[]> {
  const and: any[] = [eligibleFinancialPaymentFilter()];

  if (params.propertyIds) {
    if (!params.propertyIds.length) return [];
    const propertyMatch = identityFilter("propertyId", params.propertyIds);
    if (params.tenantIdsForUnresolvedProperty?.length) {
      and.push({
        $or: [
          propertyMatch,
          identityFilter("tenantId", params.tenantIdsForUnresolvedProperty),
        ],
      });
    } else {
      and.push(propertyMatch);
    }
  }
  if (params.tenantIds) {
    if (!params.tenantIds.length) return [];
    and.push(identityFilter("tenantId", params.tenantIds));
  }
  if (params.invoiceIds) {
    if (!params.invoiceIds.length) return [];
    and.push(identityFilter("invoiceId", params.invoiceIds));
  }
  const dateRange = paymentDateRangeFilter(params.start, params.end);
  if (dateRange) and.push(dateRange);

  const queriedPayments = await params.db.collection("payments")
    .find({ $and: and }, params.session ? { session: params.session } : undefined)
    .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
    .toArray();

  let payments = queriedPayments;
  if (params.propertyIds?.length && params.tenantIdsForUnresolvedProperty?.length) {
    const scopedPropertyIds = new Set(params.propertyIds.map(String));
    const scopedTenantIds = new Set(params.tenantIdsForUnresolvedProperty.map(String));
    const unresolvedPropertyIds = queriedPayments
      .filter((payment) => payment.tenantId != null && scopedTenantIds.has(String(payment.tenantId)) &&
        payment.propertyId != null && !scopedPropertyIds.has(String(payment.propertyId)))
      .map((payment) => payment.propertyId);
    const existingProperties = unresolvedPropertyIds.length
      ? await params.db.collection("properties")
          .find({ _id: { $in: identityValues(unresolvedPropertyIds) } } as any,
            params.session ? { session: params.session } : undefined)
          .project({ _id: 1 })
          .toArray()
      : [];
    const existingPropertyIds = new Set(existingProperties.map((property: any) => String(property._id)));
    payments = queriedPayments.filter((payment) => {
      if (payment.propertyId != null && scopedPropertyIds.has(String(payment.propertyId))) return true;
      if (payment.tenantId == null || !scopedTenantIds.has(String(payment.tenantId))) return false;
      if (payment.propertyId == null) return true;
      // A known property outside this scope remains excluded. A stale/deleted
      // property reference falls back to the in-scope tenant relationship.
      return !existingPropertyIds.has(String(payment.propertyId));
    });
  }

  if (!payments.length) return [];

  const paymentIds = payments.map((payment) => payment._id);
  const reversalRows = await params.db.collection("financialLedger").aggregate<{ _id: any; total: number }>([
    {
      $match: {
        kind: "PAYMENT_REVERSED",
        status: "posted",
        sourcePaymentId: { $in: reversalIdentityValues(paymentIds) },
      },
    },
    { $group: { _id: "$sourcePaymentId", total: { $sum: "$amount" } } },
  ], params.session ? { session: params.session } : undefined).toArray();
  return projectFinancialPaymentRows(payments, reversalRows);
}

/** Shared report projection: gross receipts are distinct from net receipts and category allocation. */
export async function getFinancialReportSummary(params: {
  db: Db;
  propertyIds?: Array<string | ObjectId>;
  start?: Date;
  end?: Date;
}): Promise<FinancialReportSummary> {
  const rows = await getFinancialPaymentRows(params);
  return summarizeFinancialPaymentRows(rows);
}

export async function getInvoicePostedAmount(db: Db, invoiceId: string, session?: ClientSession) {
  const rows = await getFinancialPaymentRows({ db, invoiceIds: [invoiceId], session });
  return money(rows.reduce((sum, row) => sum + row.netAmount, 0));
}

export type InvoiceFinancialState = InvoiceCalculation;

/** Recalculate an invoice from its immutable billing data and current posted payments. */
export async function calculateInvoiceFinancialState(db: Db, invoice: any, session?: ClientSession): Promise<InvoiceFinancialState> {
  const amountPaid = await getInvoicePostedAmount(db, String(invoice._id), session);
  return calculateInvoiceTotals({
    amount: Number(invoice.amount || 0),
    items: invoice.items,
    discount: invoice.discount,
    tax: invoice.tax,
    amountPaid,
    dueDate: invoice.dueDate || invoice.expiresAt,
  });
}

export async function reconcileInvoiceFinancialState(db: Db, invoiceId: string, session?: ClientSession) {
  if (!ObjectId.isValid(invoiceId)) return null;
  const invoice = await db.collection("invoices").findOne(
    { _id: new ObjectId(invoiceId) },
    session ? { session } : undefined,
  );
  if (!invoice) return null;
  const calculation = await calculateInvoiceFinancialState(db, invoice, session);
  await db.collection("invoices").updateOne(
    { _id: invoice._id },
    {
      $set: {
        amountPaid: calculation.amountPaid,
        balanceDue: calculation.balanceDue,
        status: calculation.status,
        paidAt: calculation.status === "PAID" ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      },
    },
    session ? { session } : undefined,
  );
  return calculation;
}

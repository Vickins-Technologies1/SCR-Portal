import { Db, ObjectId } from "mongodb";
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
  };
};

const normalizeProvider = (value: unknown) => {
  const provider = String(value || "legacy").trim().toLowerCase();
  return provider === "mpesa" || provider === "daraja_c2b" ? "daraja" : provider;
};

/**
 * Older callback paths could leave more than one successful payment document
 * for the same provider event. Provider identity is the durable identity of a
 * payment; Mongo _id is only the storage identity. Keep the strongest row and
 * map all aliases back to it so reversals attached to a legacy duplicate are
 * still applied to the surviving row.
 */
export function deduplicateFinancialPayments(payments: any[]) {
  const parent = new Map<string, string>();
  const identityOwner = new Map<string, string>();

  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  const identitiesFor = (payment: any) => {
    const provider = normalizeProvider(payment.provider || payment.paymentMethod);
    return [
      payment.providerTransactionId,
      payment.mpesaCode,
      payment.checkoutRequestId,
      payment.merchantRequestId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => `${provider}:${value}`);
  };

  for (const payment of payments) {
    const id = String(payment._id);
    parent.set(id, id);
    for (const identity of identitiesFor(payment)) {
      const previous = identityOwner.get(identity);
      if (previous) union(id, previous);
      else identityOwner.set(identity, id);
    }
  }

  const score = (payment: any) => {
    let value = 0;
    if (payment.financialPostingStatus === "posted") value += 8;
    if (payment.financialEffectsApplied === true) value += 4;
    if (payment.postedAmount != null || payment.providerConfirmedAmount != null) value += 2;
    if (String(payment.status || "").toLowerCase() === "completed") value += 1;
    return value;
  };

  const representatives = new Map<string, any>();
  const aliases = new Map<string, string>();
  for (const payment of payments) {
    const id = String(payment._id);
    const root = find(id);
    const current = representatives.get(root);
    if (!current || score(payment) > score(current) || (score(payment) === score(current) && id < String(current._id))) {
      representatives.set(root, payment);
    }
  }
  for (const payment of payments) {
    aliases.set(String(payment._id), String(representatives.get(find(String(payment._id)))._id));
  }

  return {
    payments: [...representatives.values()],
    aliases,
  };
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
    const allocation = storedAllocation || {
      rent: payment.type === "Rent" ? netAmount : 0,
      utilities: payment.type === "Utility" ? netAmount : 0,
      deposit: payment.type === "Deposit" ? netAmount : 0,
      other: payment.type === "Other" ? netAmount : 0,
      walletCredit: payment.type ? 0 : netAmount,
    };

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
  invoiceIds?: Array<string | ObjectId>;
  start?: Date;
  end?: Date;
}): Promise<FinancialPaymentRow[]> {
  const and: any[] = [eligibleFinancialPaymentFilter()];

  if (params.propertyIds) {
    if (!params.propertyIds.length) return [];
    and.push(identityFilter("propertyId", params.propertyIds));
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

  const payments = await params.db.collection("payments")
    .find({ $and: and })
    .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
    .toArray();

  if (!payments.length) return [];

  const { payments: uniquePayments, aliases } = deduplicateFinancialPayments(payments);
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
  ]).toArray();
  const reversalTotals = new Map<string, number>();
  for (const row of reversalRows) {
    const canonicalId = aliases.get(String(row._id)) || String(row._id);
    reversalTotals.set(canonicalId, money((reversalTotals.get(canonicalId) || 0) + money(row.total)));
  }
  return projectFinancialPaymentRows(
    uniquePayments,
    [...reversalTotals.entries()].map(([id, total]) => ({ _id: id, total })),
  );
}

/** Shared report projection: gross receipts are distinct from net receipts and category allocation. */
export async function getFinancialReportSummary(params: {
  db: Db;
  propertyIds?: Array<string | ObjectId>;
  start?: Date;
  end?: Date;
}): Promise<FinancialReportSummary> {
  const rows = await getFinancialPaymentRows(params);
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

  for (const row of rows) {
    summary.totalReceived += row.originalAmount;
    summary.netReceived += row.netAmount;
    summary.rentReceived += row.allocation.rent;
    summary.utilityReceived += row.allocation.utilities;
    summary.depositReceived += row.allocation.deposit;
    summary.otherReceived += row.allocation.other;
    summary.unappliedCredit += row.allocation.walletCredit;
    if (!row.payment.allocation && !row.payment.type) summary.legacyUnallocatedPayments += row.netAmount;
  }

  for (const key of Object.keys(summary) as Array<keyof FinancialReportSummary>) {
    summary[key] = money(summary[key]);
  }
  return summary;
}

export async function getInvoicePostedAmount(db: Db, invoiceId: string) {
  const rows = await getFinancialPaymentRows({ db, invoiceIds: [invoiceId] });
  return money(rows.reduce((sum, row) => sum + row.netAmount, 0));
}

export type InvoiceFinancialState = InvoiceCalculation;

/** Recalculate an invoice from its immutable billing data and current posted payments. */
export async function calculateInvoiceFinancialState(db: Db, invoice: any): Promise<InvoiceFinancialState> {
  const amountPaid = await getInvoicePostedAmount(db, String(invoice._id));
  return calculateInvoiceTotals({
    amount: Number(invoice.amount || 0),
    items: invoice.items,
    discount: invoice.discount,
    tax: invoice.tax,
    amountPaid,
    dueDate: invoice.dueDate || invoice.expiresAt,
  });
}

export async function reconcileInvoiceFinancialState(db: Db, invoiceId: string) {
  if (!ObjectId.isValid(invoiceId)) return null;
  const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
  if (!invoice) return null;
  const calculation = await calculateInvoiceFinancialState(db, invoice);
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
  );
  return calculation;
}

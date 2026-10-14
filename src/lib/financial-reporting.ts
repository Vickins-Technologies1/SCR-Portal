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

import { Db, ObjectId } from "mongodb";
import { calculateInvoiceTotals } from "@/lib/invoice-calculations";

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

const money = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

/** Shared report projection: money received is distinct from category allocation. */
export async function getFinancialReportSummary(params: {
  db: Db;
  propertyIds: string[];
  start?: Date;
  end?: Date;
}): Promise<FinancialReportSummary> {
  const query: any = {
    propertyId: { $in: params.propertyIds },
    status: "completed",
    financialPostingStatus: { $ne: "quarantined" },
  };
  if (params.start || params.end) {
    const stringRange: any = {};
    const dateRange: any = {};
    if (params.start) {
      stringRange.$gte = params.start.toISOString();
      dateRange.$gte = params.start;
    }
    if (params.end) {
      stringRange.$lte = params.end.toISOString();
      dateRange.$lte = params.end;
    }
    query.$or = [{ paymentDate: stringRange }, { paymentDate: dateRange }];
  }
  const payments = await params.db.collection("payments").find(query).toArray();
  const paymentIds = payments.map((payment) => payment._id);
  const reversalRows = paymentIds.length
    ? await params.db.collection("financialLedger").aggregate<{ _id: any; total: number }>([
        { $match: { kind: "PAYMENT_REVERSED", status: "posted", sourcePaymentId: { $in: paymentIds } } },
        { $group: { _id: "$sourcePaymentId", total: { $sum: "$amount" } } },
      ]).toArray()
    : [];
  const reversed = new Map(reversalRows.map((row) => [String(row._id), money(row.total)]));
  const summary: FinancialReportSummary = {
    totalReceived: 0, rentReceived: 0, utilityReceived: 0, depositReceived: 0,
    otherReceived: 0, unappliedCredit: 0, netReceived: 0, legacyUnallocatedPayments: 0,
  };
  for (const payment of payments) {
    const original = money(payment.postedAmount ?? payment.amount);
    const net = Math.max(0, original - (reversed.get(String(payment._id)) || 0));
    summary.totalReceived += original;
    summary.netReceived += net;
    const allocation = payment.allocation;
    if (!allocation) {
      summary.legacyUnallocatedPayments += net;
      continue;
    }
    const ratio = original > 0 ? net / original : 0;
    summary.rentReceived += money(money(allocation.rent) * ratio);
    summary.utilityReceived += money(money(allocation.utilities) * ratio);
    summary.depositReceived += money(money(allocation.deposit) * ratio);
    summary.otherReceived += money(money(allocation.other) * ratio);
    summary.unappliedCredit += money(money(allocation.walletCredit) * ratio);
  }
  for (const key of Object.keys(summary) as Array<keyof FinancialReportSummary>) summary[key] = money(summary[key]);
  return summary;
}

export async function getInvoicePostedAmount(db: Db, invoiceId: string) {
  const payments = await db.collection("payments").find({
    invoiceId,
    status: "completed",
    financialPostingStatus: { $ne: "quarantined" },
  }).project({ amount: 1, postedAmount: 1, _id: 1 }).toArray();
  if (!payments.length) return 0;
  const reversalRows = await db.collection("financialLedger").aggregate<{ _id: any; total: number }>([
    { $match: { kind: "PAYMENT_REVERSED", status: "posted", sourcePaymentId: { $in: payments.map((payment) => payment._id) } } },
    { $group: { _id: "$sourcePaymentId", total: { $sum: "$amount" } } },
  ]).toArray();
  const reversed = new Map(reversalRows.map((row) => [String(row._id), money(row.total)]));
  return money(payments.reduce((sum, payment) => sum + Math.max(0, money(payment.postedAmount ?? payment.amount) - (reversed.get(String(payment._id)) || 0)), 0));
}

export async function reconcileInvoiceFinancialState(db: Db, invoiceId: string) {
  if (!ObjectId.isValid(invoiceId)) return null;
  const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
  if (!invoice) return null;
  const amountPaid = await getInvoicePostedAmount(db, invoiceId);
  const calculation = calculateInvoiceTotals({
    amount: Number(invoice.amount || 0), items: invoice.items, discount: invoice.discount,
    tax: invoice.tax, amountPaid, dueDate: invoice.dueDate || invoice.expiresAt,
  });
  await db.collection("invoices").updateOne({ _id: invoice._id }, { $set: {
    amountPaid: calculation.amountPaid,
    balanceDue: calculation.balanceDue,
    status: calculation.status,
    paidAt: calculation.status === "PAID" ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  } });
  return calculation;
}

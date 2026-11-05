export {
  addInvoicePaymentStates,
  getManualTenantInvoiceChargeObligations,
  getManualTenantInvoiceChargeTotals,
  invoiceCategoryTotals,
  invoiceItemsForDisplay,
  invoiceTotals,
  recordTenantInvoiceCharges,
  recordTenantInvoicePaymentAllocations,
  recordTenantInvoicePaymentReversal,
  recordTenantInvoiceWalletAllocations,
  serializeTenantInvoice,
  validObjectId,
} from "@/lib/tenant-invoice-ledger";

export type { InvoiceChargeCategory, InvoiceLedgerCategory, TenantInvoiceLedgerKind } from "@/lib/tenant-invoice-ledger";

import { Db } from "mongodb";
import { identityValues } from "@/lib/payment-query";
import { addInvoicePaymentStates } from "@/lib/tenant-invoice-ledger";

/** Returns prior open invoice balances for the same tenancy without adding a receivable. */
export async function getPriorInvoiceOutstandingMinor(db: Db, invoice: any) {
  const rows = await db.collection("tenantInvoices").find({
    tenantId: { $in: identityValues(invoice.tenantId) }, propertyId: { $in: identityValues(invoice.propertyId) },
    status: { $in: ["issued", "partially_paid", "paid", "overdue"] }, _id: { $ne: invoice._id },
  }).sort({ billingPeriod: 1, issueDate: 1 }).limit(1200).toArray();
  const orderKey = (row: any) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(row.billingPeriod || ""))
    ? `${row.billingPeriod}-01T00:00:00.000Z`
    : new Date(row.issueDate || row.createdAt || 0).toISOString();
  const currentKey = orderKey(invoice);
  const prior = rows.filter((row: any) => orderKey(row) < currentKey);
  if (!prior.length) return 0;
  const calculated = await addInvoicePaymentStates(db, prior);
  return calculated.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.balanceMinor) || 0), 0);
}

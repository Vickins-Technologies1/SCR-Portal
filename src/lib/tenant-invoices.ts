import "server-only";
import { ObjectId, type Db } from "mongodb";
import { identityValues } from "@/lib/payment-query";

export type TenantInvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled";
export type InvoiceChargeCategory = "rent" | "utilities" | "other";

export function invoiceTotals(items: Array<{ quantity: number; unitAmount: number }>) {
  const normalized = items.map((item) => ({ ...item, amount: Math.round(item.quantity * item.unitAmount) }));
  return { items: normalized, totalMinor: normalized.reduce((sum, item) => sum + item.amount, 0) };
}

export function invoiceCategoryTotals(invoice: any): Record<InvoiceChargeCategory, number> {
  const totals: Record<InvoiceChargeCategory, number> = { rent: 0, utilities: 0, other: 0 };
  for (const item of invoice.items || []) {
    const category: InvoiceChargeCategory = item.category === "utilities" || item.category === "other" ? item.category : "rent";
    totals[category] += Math.round(Number(item.amount) || 0);
  }
  for (const adjustment of invoice.adjustments || []) {
    const category: InvoiceChargeCategory = adjustment.category === "rent" || adjustment.category === "utilities" ? adjustment.category : "other";
    totals[category] += Math.round(Number(adjustment.amountMinor) || 0);
  }
  for (const category of ["rent", "utilities", "other"] as const) totals[category] = Math.max(0, totals[category]);
  return totals;
}

export function invoiceItemsForDisplay(invoice: any) {
  return [
    ...(invoice.items || []),
    ...(invoice.adjustments || []).map((adjustment: any) => ({
      description: `${Number(adjustment.amountMinor) < 0 ? "Credit" : "Adjustment"}: ${adjustment.description}`,
      quantity: 1,
      unitAmount: Math.abs(Number(adjustment.amountMinor) || 0),
      amount: Number(adjustment.amountMinor) || 0,
      category: adjustment.category || "other",
    })),
  ];
}

/** Payment balances come from posted ledger allocations; invoices never create another receivable. */
export async function addInvoicePaymentStates(db: Db, invoices: any[]) {
  const groups = new Map<string, any[]>();
  for (const invoice of invoices) {
    const key = `${invoice.tenantId}:${invoice.propertyId}`;
    const group = groups.get(key) || [];
    group.push(invoice);
    groups.set(key, group);
  }
  const pairFilters = [...groups.values()].map((group) => ({
    tenantId: { $in: identityValues(group[0].tenantId) },
    propertyId: { $in: identityValues(group[0].propertyId) },
    status: { $nin: ["draft", "cancelled"] },
  }));
  const relatedInvoices = pairFilters.length
    ? await db.collection("tenantInvoices").find({ $or: pairFilters }).toArray()
    : [];
  const results = new Map<string, any>();
  for (const requestedGroup of groups.values()) {
    const first = requestedGroup[0];
    const key = `${first.tenantId}:${first.propertyId}`;
    const invoiceIds = new Set<string>();
    const group = [
      ...relatedInvoices.filter((row: any) => `${row.tenantId}:${row.propertyId}` === key),
      ...requestedGroup,
    ].filter((row: any) => {
      const id = String(row._id);
      if (invoiceIds.has(id)) return false;
      invoiceIds.add(id);
      return true;
    });
    const ledgerRows = await db.collection("financialLedger").find({
      tenantId: { $in: identityValues(first.tenantId) }, propertyId: { $in: identityValues(first.propertyId) },
      kind: { $in: ["PAYMENT_POSTED", "PAYMENT_REVERSED"] }, status: "posted",
    }).toArray();
    const payments = new Map<string, { paymentId: string; reference?: string; occurredAt: Date; available: Record<InvoiceChargeCategory, number> }>();
    for (const row of ledgerRows) {
      const sign = row.kind === "PAYMENT_REVERSED" ? -1 : 1;
      const paymentId = String(row.sourcePaymentId || row.eventKey || "");
      if (!paymentId) continue;
      const current = payments.get(paymentId) || { paymentId, reference: row.providerReference || row.providerTransactionId, occurredAt: new Date(row.occurredAt || row.createdAt || 0), available: { rent: 0, utilities: 0, other: 0 } };
      const allocation = row.allocation || {};
      current.available.rent += sign * Math.round(Number(allocation.rent || 0) * 100);
      current.available.utilities += sign * Math.round(Number(allocation.utilities || 0) * 100);
      current.available.other += sign * Math.round(Number(allocation.other || 0) * 100);
      if (row.kind === "PAYMENT_POSTED") {
        current.reference = row.providerReference || row.providerTransactionId || current.reference;
        current.occurredAt = new Date(row.occurredAt || row.createdAt || current.occurredAt);
      }
      payments.set(paymentId, current);
    }
    const orderedPayments = [...payments.values()].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.paymentId.localeCompare(b.paymentId));
    for (const payment of orderedPayments) for (const category of ["rent", "utilities", "other"] as const) payment.available[category] = Math.max(0, payment.available[category]);
    const ordered = [...group].filter((invoice) => !["draft", "cancelled"].includes(invoice.status)).sort((a, b) => String(a.billingPeriod || a.issueDate).localeCompare(String(b.billingPeriod || b.issueDate)) || String(a._id).localeCompare(String(b._id)));
    for (const invoice of ordered) {
      const allocationHistory: Array<{ paymentId: string; reference?: string; category: InvoiceChargeCategory; amountMinor: number; occurredAt: Date }> = [];
      const categoryTotals = invoiceCategoryTotals(invoice);
      for (const category of ["rent", "utilities", "other"] as const) {
        let remaining = categoryTotals[category];
        for (const payment of orderedPayments) {
          if (!remaining) break;
          const allocated = Math.min(remaining, payment.available[category]);
          if (allocated <= 0) continue;
          allocationHistory.push({ paymentId: payment.paymentId, reference: payment.reference, category, amountMinor: allocated, occurredAt: payment.occurredAt });
          payment.available[category] -= allocated;
          remaining -= allocated;
        }
      }
      const totalMinor = Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0);
      const amountPaidMinor = Math.min(totalMinor, allocationHistory.reduce((sum, allocation) => sum + allocation.amountMinor, 0));
      const balanceMinor = Math.max(0, totalMinor - amountPaidMinor);
      const due = invoice.dueDate ? new Date(invoice.dueDate).getTime() : Number.NaN;
      const status: TenantInvoiceStatus = balanceMinor === 0 ? "paid" : Number.isFinite(due) && due < Date.now() ? "overdue" : amountPaidMinor > 0 ? "partially_paid" : "issued";
      results.set(String(invoice._id), { ...invoice, totalMinor, amountPaidMinor, balanceMinor, status, paymentAllocations: allocationHistory, displayItems: invoiceItemsForDisplay(invoice) });
    }
    for (const invoice of group.filter((row) => ["draft", "cancelled"].includes(row.status))) {
      results.set(String(invoice._id), { ...invoice, amountPaidMinor: 0, balanceMinor: Number(invoice.totalMinor) || 0, status: invoice.status });
    }
  }
  return invoices.map((invoice) => serializeTenantInvoice(results.get(String(invoice._id)) || invoice));
}

/** Returns prior open invoice balances for the same tenancy without adding a receivable. */
export async function getPriorInvoiceOutstandingMinor(db: Db, invoice: any) {
  const rows = await db.collection("tenantInvoices").find({
    tenantId: invoice.tenantId,
    propertyId: invoice.propertyId,
    status: { $in: ["issued", "partially_paid", "paid", "overdue"] },
    _id: { $ne: invoice._id },
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

export function serializeTenantInvoice(invoice: any) {
  return {
    ...invoice,
    _id: invoice._id?.toString?.() || String(invoice._id || ""),
    issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString() : null,
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString() : null,
    createdAt: invoice.createdAt ? new Date(invoice.createdAt).toISOString() : null,
    updatedAt: invoice.updatedAt ? new Date(invoice.updatedAt).toISOString() : null,
    total: Number(invoice.totalMinor || 0) / 100,
    amountPaid: Number(invoice.amountPaidMinor || 0) / 100,
    balanceDue: Number(invoice.balanceMinor ?? invoice.totalMinor ?? 0) / 100,
  };
}

export function validObjectId(value: unknown): value is string {
  return typeof value === "string" && ObjectId.isValid(value);
}

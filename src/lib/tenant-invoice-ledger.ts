import "server-only";
import { Db, ObjectId } from "mongodb";
import { identityValues, paymentEventDate } from "@/lib/payment-query";
import { businessDateKey } from "@/lib/business-time";
import logger from "@/lib/logger";

export type InvoiceChargeCategory = "rent" | "utilities" | "deposit" | "penalty" | "other";
export type InvoiceLedgerCategory = "rent" | "utilities" | "deposit" | "other";
export type TenantInvoiceLedgerKind = "CHARGE_SNAPSHOT" | "CHARGE_ADJUSTMENT" | "PAYMENT_ALLOCATION" | "WALLET_APPLIED" | "PAYMENT_ALLOCATION_REVERSED" | "WALLET_ALLOCATION_REVERSED" | "INVOICE_CANCELLED";

const invoiceCategories: InvoiceChargeCategory[] = ["rent", "utilities", "deposit", "penalty", "other"];
const ledgerCategories: InvoiceLedgerCategory[] = ["deposit", "rent", "utilities", "other"];
const positiveMinor = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
const amountMinor = (value: unknown) => Math.round(Number(value) || 0);
const amountInDollars = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));
const invoiceCategory = (value: unknown): InvoiceChargeCategory => invoiceCategories.includes(value as InvoiceChargeCategory) ? value as InvoiceChargeCategory : "rent";
const ledgerCategoryFor = (value: InvoiceChargeCategory): InvoiceLedgerCategory => value === "penalty" ? "other" : value;
const ledgerIndexPromises = new WeakMap<Db, Promise<void>>();

/** Legacy monthly dues invoices predate the explicit invoiceBasis field. */
export function isAutomaticTenantDuesInvoice(invoice: { invoiceBasis?: unknown; invoiceNumber?: unknown; billingPeriod?: unknown }) {
  if (String(invoice.invoiceBasis || "") === "overdue_tenant_dues_v1") return true;
  const invoiceNumber = String(invoice.invoiceNumber || "");
  const billingPeriod = String(invoice.billingPeriod || "");
  if (/^DRAFT-/i.test(invoiceNumber) && /^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) return true;
  // Accepted historical forms: R-YYYYMM-<id>, R-YYYYMMDD-<id>, and
  // R-<owner-prefix>-YYYYMM-<id>.
  return /^R-(?:[A-Z0-9]{1,8}-)?\d{6}(?:\d{2})?-[A-Z0-9]{24}$/i.test(invoiceNumber);
}

async function ensureLedgerIndexes(db: Db) {
  let pending = ledgerIndexPromises.get(db);
  if (!pending) {
    pending = db.collection("tenantInvoiceLedger").createIndexes([
      { key: { eventKey: 1 }, name: "tenantInvoiceLedger_eventKey_unique", unique: true },
      { key: { invoiceId: 1, occurredAt: 1, _id: 1 }, name: "tenantInvoiceLedger_invoice_occurred" },
      { key: { sourcePaymentId: 1, invoiceId: 1 }, name: "tenantInvoiceLedger_payment_invoice" },
    ]).then(() => undefined).catch((error) => {
      ledgerIndexPromises.delete(db);
      throw error;
    });
    ledgerIndexPromises.set(db, pending);
  }
  await pending;
}

export function invoiceTotals(items: Array<{ quantity: number; unitAmount: number }>) {
  const normalized = items.map((item) => ({ ...item, amount: Math.round(item.quantity * item.unitAmount) }));
  return { items: normalized, totalMinor: normalized.reduce((sum, item) => sum + item.amount, 0) };
}

export function invoiceCategoryTotals(invoice: any): Record<InvoiceChargeCategory, number> {
  const totals: Record<InvoiceChargeCategory, number> = { rent: 0, utilities: 0, deposit: 0, penalty: 0, other: 0 };
  for (const item of invoice.items || []) totals[invoiceCategory(item.category)] += Math.round(Number(item.amount) || 0);
  for (const adjustment of invoice.adjustments || []) {
    const category = invoiceCategory(adjustment.category);
    totals[category] += amountMinor(adjustment.amountMinor);
  }
  for (const category of invoiceCategories) totals[category] = Math.max(0, totals[category]);
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
      category: invoiceCategory(adjustment.category),
    })),
  ];
}

function chargeSnapshot(invoice: any, events: any[]) {
  const snapshot = events.find((event) => event.kind === "CHARGE_SNAPSHOT");
  const adjustments = events.filter((event) => event.kind === "CHARGE_ADJUSTMENT");
  const items = snapshot && Array.isArray(snapshot.items)
    ? snapshot.items.map((item: any) => ({ ...item }))
    : (invoice.items || []);
  const adjustmentEvents = new Map(adjustments.map((event) => [String(event.adjustmentId || event.eventKey), event]));
  const usedAdjustmentIds = new Set<string>();
  const adjustmentItems = (invoice.adjustments || []).map((adjustment: any, index: number) => {
    const adjustmentId = String(adjustment.eventId || adjustment._id || `${index}-${new Date(adjustment.createdAt || 0).getTime()}`);
    const event = adjustmentEvents.get(adjustmentId);
    usedAdjustmentIds.add(adjustmentId);
    const amount = amountMinor(event?.amountMinor ?? adjustment.amountMinor);
    return {
      description: `${amount < 0 ? "Credit" : "Adjustment"}: ${String(event?.description || adjustment.description || "Adjustment")}`,
      quantity: 1, unitAmount: Math.abs(amount), amount, category: invoiceCategory(event?.category || adjustment.category),
    };
  });
  for (const event of adjustments) {
    const adjustmentId = String(event.adjustmentId || event.eventKey);
    if (usedAdjustmentIds.has(adjustmentId)) continue;
    const amount = amountMinor(event.amountMinor);
    adjustmentItems.push({
      description: `${amount < 0 ? "Credit" : "Adjustment"}: ${String(event.description || "Adjustment")}`,
      quantity: 1, unitAmount: Math.abs(amount), amount, category: invoiceCategory(event.category),
    });
  }
  const totals: Record<InvoiceChargeCategory, number> = { rent: 0, utilities: 0, deposit: 0, penalty: 0, other: 0 };
  for (const item of items) totals[invoiceCategory(item.category)] += Math.round(Number(item.amount) || 0);
  for (const item of adjustmentItems) totals[invoiceCategory(item.category)] += Math.round(Number(item.amount) || 0);
  for (const category of invoiceCategories) totals[category] = Math.max(0, totals[category]);
  const originalInvoiceTotalMinor = items.reduce((sum: number, item: any) => sum + Math.max(0, Math.round(Number(item.amount) || 0)), 0);
  return { totals, items: [...items, ...adjustmentItems], originalInvoiceTotalMinor };
}

const isTerminalInvoice = (status: string) => ["draft", "cancelled", "voided", "superseded"].includes(status);
const invoiceOrderKey = (invoice: any) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(invoice.billingPeriod || ""))
  ? `${invoice.billingPeriod}-01`
  : String(invoice.dueDate || invoice.issueDate || invoice.createdAt || "");

function signedCategoryMap() {
  return { rent: 0, utilities: 0, deposit: 0, other: 0 } as Record<InvoiceLedgerCategory, number>;
}

export function calculateWalletConsumedAllocation(rows: any[], fallbackCategory: unknown = "other") {
  const totals = signedCategoryMap();
  const cumulative = signedCategoryMap();
  const fallbackCandidates: unknown[] = Array.isArray(fallbackCategory) ? fallbackCategory : [fallbackCategory];
  const fallbackValue = fallbackCandidates.find(
    (candidate): candidate is InvoiceLedgerCategory =>
      typeof candidate === "string" && ledgerCategories.includes(candidate as InvoiceLedgerCategory),
  );
  const fallback: InvoiceLedgerCategory = fallbackValue || "other";
  const ordered = [...rows].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime() || String(a.eventKey || a._id).localeCompare(String(b.eventKey || b._id)));
  for (const row of ordered) {
    const snapshot = row.walletAllocation && typeof row.walletAllocation === "object" ? row.walletAllocation : null;
    const hasSnapshot = snapshot && ledgerCategories.some((category) => Number(snapshot[category]) > 0);
    if (hasSnapshot) {
      for (const category of ledgerCategories) {
        const next = Math.max(0, Math.round((Number(snapshot[category]) || 0) * 100) / 100);
        totals[category] += Math.max(0, next - cumulative[category]);
        cumulative[category] = next;
      }
    } else {
      totals[fallback] += Math.max(0, Math.round((Number(row.amount) || 0) * 100) / 100);
    }
  }
  return totals;
}

function getInvoiceOpenCategories(invoice: any) {
  const totals = invoiceCategoryTotals(invoice);
  const paid = invoice.categoryPaidMinor || {};
  return Object.fromEntries(invoiceCategories.map((category) => [category, Math.max(0, totals[category] - positiveMinor(paid[category]))])) as Record<InvoiceChargeCategory, number>;
}

function appendAllocation(target: any[], row: any) {
  if (row.amountMinor <= 0) return;
  target.push({
    paymentId: String(row.paymentId || ""),
    reference: row.reference || undefined,
    category: row.category,
    amountMinor: row.amountMinor,
    occurredAt: row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt || 0),
    source: row.source || "payment",
    ...(row.reversal ? { reversal: true } : {}),
  });
}

/**
 * The shared tenant-invoice calculation engine. New invoice ledger events are
 * authoritative. Older posted payment rows are projected FIFO by category,
 * with any amount already represented by a new event removed from the legacy
 * projection to prevent double counting during the rollout.
 */
export async function addInvoicePaymentStates(db: Db, invoices: any[]) {
  const groups = new Map<string, any[]>();
  for (const invoice of invoices) {
    const key = `${invoice.tenantId}:${invoice.propertyId}`;
    groups.set(key, [...(groups.get(key) || []), invoice]);
  }
  const output = new Map<string, any>();

  for (const requestedGroup of groups.values()) {
    const first = requestedGroup[0];
    const related = await db.collection("tenantInvoices").find({
      tenantId: { $in: identityValues(first.tenantId) },
      propertyId: { $in: identityValues(first.propertyId) },
      status: { $nin: ["draft", "cancelled", "voided", "superseded"] },
    }).toArray();
    const invoiceById = new Map<string, any>();
    for (const row of [...related, ...requestedGroup]) invoiceById.set(String(row._id), row);
    const allInvoices = [...invoiceById.values()].sort((a, b) => invoiceOrderKey(a).localeCompare(invoiceOrderKey(b)) || String(a._id).localeCompare(String(b._id)));
    const active = allInvoices.filter((invoice) => !isTerminalInvoice(String(invoice.status)));
    const [ledgerRows, invoiceEvents, walletRows, paymentRows] = await Promise.all([
      db.collection("financialLedger").find({
        tenantId: { $in: identityValues(first.tenantId) }, propertyId: { $in: identityValues(first.propertyId) },
        kind: { $in: ["PAYMENT_POSTED", "PAYMENT_REVERSED"] }, status: "posted",
      }).toArray(),
      db.collection("tenantInvoiceLedger").find({ tenantId: String(first.tenantId), propertyId: String(first.propertyId) }).toArray(),
      db.collection("walletTransactions").find({ tenantId: { $in: identityValues(first.tenantId) }, propertyId: { $in: identityValues(first.propertyId) }, kind: "CREDIT_CONSUMED" }).toArray(),
      db.collection("payments").find({ tenantId: { $in: identityValues(first.tenantId) }, propertyId: { $in: identityValues(first.propertyId) } }).project({ tenantInvoiceId: 1, invoiceId: 1 }).toArray(),
    ]);
    const paymentById = new Map(paymentRows.map((payment: any) => [String(payment._id), payment]));

    const eventsByInvoice = new Map<string, any[]>();
    for (const event of invoiceEvents) {
      const key = String(event.invoiceId || "");
      eventsByInvoice.set(key, [...(eventsByInvoice.get(key) || []), event]);
    }
    const invoiceCategoryPaid = new Map<string, Record<InvoiceChargeCategory, number>>();
    const invoiceChargeTotals = new Map<string, Record<InvoiceChargeCategory, number>>();
    const originalInvoiceTotals = new Map<string, number>();
    const invoiceAllocations = new Map<string, any[]>();
    const directPaymentBySource = new Map<string, Record<InvoiceLedgerCategory, number>>();
    const directWalletByWalletEvent = new Map<string, Record<InvoiceLedgerCategory, number>>();

    for (const invoice of active) {
      const id = String(invoice._id);
      const charges = chargeSnapshot(invoice, eventsByInvoice.get(id) || []);
      invoiceChargeTotals.set(id, charges.totals);
      originalInvoiceTotals.set(id, charges.originalInvoiceTotalMinor);
      const categoryPaid: Record<InvoiceChargeCategory, number> = { rent: 0, utilities: 0, deposit: 0, penalty: 0, other: 0 };
      const display: any[] = [];
      for (const event of eventsByInvoice.get(id) || []) {
        const category = invoiceCategory(event.category);
        const ledgerCategory = ledgerCategoryFor(category);
        const value = positiveMinor(event.amountMinor);
        if (event.kind === "PAYMENT_ALLOCATION" || event.kind === "WALLET_APPLIED") {
          categoryPaid[category] += value;
          const source = event.kind === "WALLET_APPLIED" ? "wallet" : "payment";
          appendAllocation(display, { paymentId: event.sourcePaymentId || event.paymentId, reference: event.reference, category, amountMinor: value, occurredAt: event.occurredAt, source });
          if (event.kind === "PAYMENT_ALLOCATION") {
            const sourceId = String(event.sourcePaymentId || event.paymentId || "");
            const map = directPaymentBySource.get(sourceId) || signedCategoryMap();
            map[ledgerCategory] += value;
            directPaymentBySource.set(sourceId, map);
          } else {
            const walletKey = String(event.sourceWalletEventKey || "");
            const eventMap = directWalletByWalletEvent.get(walletKey) || signedCategoryMap();
            eventMap[ledgerCategory] += value;
            directWalletByWalletEvent.set(walletKey, eventMap);
          }
        } else if (event.kind === "PAYMENT_ALLOCATION_REVERSED" || event.kind === "WALLET_ALLOCATION_REVERSED") {
          categoryPaid[category] -= value;
          appendAllocation(display, { paymentId: event.sourcePaymentId, reference: event.reference, category, amountMinor: value, occurredAt: event.occurredAt, source: event.kind === "WALLET_ALLOCATION_REVERSED" ? "wallet" : "payment", reversal: true });
          const sourceId = String(event.sourcePaymentId || "");
          if (event.kind === "PAYMENT_ALLOCATION_REVERSED") {
            const map = directPaymentBySource.get(sourceId) || signedCategoryMap();
            map[ledgerCategory] -= value;
            directPaymentBySource.set(sourceId, map);
          } else {
            const walletKey = String(event.sourceWalletEventKey || "");
            const eventMap = directWalletByWalletEvent.get(walletKey) || signedCategoryMap();
            directWalletByWalletEvent.set(walletKey, eventMap);
          }
        }
      }
      for (const category of invoiceCategories) categoryPaid[category] = Math.max(0, categoryPaid[category]);
      invoiceCategoryPaid.set(id, categoryPaid);
      invoiceAllocations.set(id, display);
    }

    const openByInvoice = new Map<string, Record<InvoiceChargeCategory, number>>();
    for (const invoice of active) openByInvoice.set(String(invoice._id), getInvoiceOpenCategories({
      ...invoice, categoryTotalsMinor: invoiceChargeTotals.get(String(invoice._id)), categoryPaidMinor: invoiceCategoryPaid.get(String(invoice._id)),
    }));
    const orderedInvoices = [...active];
    const targetFirst = (targetId: unknown) => {
      const target = String(targetId || "");
      return target && openByInvoice.has(target)
        ? [invoiceById.get(target), ...orderedInvoices.filter((invoice) => String(invoice._id) !== target)]
        : orderedInvoices;
    };
    const allocateToInvoices = (amount: number, category: InvoiceChargeCategory, options: { paymentId?: string; reference?: string; occurredAt?: unknown; source?: string; targetInvoiceId?: string; onlyTarget?: boolean } = {}) => {
      let remaining = positiveMinor(amount);
      const candidates = options.onlyTarget ? orderedInvoices.filter((invoice) => String(invoice._id) === String(options.targetInvoiceId)) : targetFirst(options.targetInvoiceId);
      for (const invoice of candidates) {
        if (!remaining) break;
        const id = String(invoice._id);
        const open = openByInvoice.get(id)!;
        const applied = Math.min(open[category], remaining);
        if (!applied) continue;
        open[category] -= applied;
        const paid = invoiceCategoryPaid.get(id)!;
        paid[category] += applied;
        remaining -= applied;
        appendAllocation(invoiceAllocations.get(id)!, { paymentId: options.paymentId, reference: options.reference, category, amountMinor: applied, occurredAt: options.occurredAt, source: options.source || "payment" });
      }
      return remaining;
    };

    const paymentPools = new Map<string, { occurredAt: Date; reference?: string; available: Record<InvoiceLedgerCategory, number> }>();
    for (const row of ledgerRows) {
      const paymentId = String(row.sourcePaymentId || row.eventKey || "");
      if (!paymentId) continue;
      const pool = paymentPools.get(paymentId) || { occurredAt: new Date(row.occurredAt || row.createdAt || 0), reference: row.providerReference || row.providerTransactionId, available: signedCategoryMap() };
      const sign = row.kind === "PAYMENT_REVERSED" ? -1 : 1;
      for (const category of ledgerCategories) pool.available[category] += sign * amountInDollars(row.allocation?.[category]);
      if (row.kind === "PAYMENT_POSTED") {
        pool.occurredAt = new Date(row.occurredAt || row.createdAt || pool.occurredAt);
        pool.reference = row.providerReference || row.providerTransactionId || pool.reference;
      }
      paymentPools.set(paymentId, pool);
    }
    const orderedPayments = [...paymentPools.entries()].sort((a, b) => a[1].occurredAt.getTime() - b[1].occurredAt.getTime() || a[0].localeCompare(b[0]));
    for (const [paymentId, pool] of orderedPayments) {
      const direct = directPaymentBySource.get(paymentId) || signedCategoryMap();
      for (const category of ledgerCategories) pool.available[category] = Math.max(0, pool.available[category] - positiveMinor(direct[category]));
      const payment = paymentById.get(paymentId);
      const targetInvoiceId = payment?.tenantInvoiceId;
      for (const category of ledgerCategories) {
        let remaining = positiveMinor(pool.available[category]);
        const target = String(targetInvoiceId || "");
        const compatible = category === "other" ? ["penalty", "other"] as InvoiceChargeCategory[] : [category as InvoiceChargeCategory];
        for (const itemCategory of compatible) {
          if (!remaining) break;
          remaining = allocateToInvoices(remaining, itemCategory, { paymentId, reference: pool.reference, occurredAt: pool.occurredAt, targetInvoiceId: target || undefined });
        }
      }
    }

    const walletBySource = new Map<string, any[]>();
    for (const row of walletRows) {
      const sourcePaymentId = String(row.sourcePaymentId || "");
      walletBySource.set(sourcePaymentId, [...(walletBySource.get(sourcePaymentId) || []), row]);
    }
    for (const [sourcePaymentId, rows] of walletBySource) {
      rows.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime() || String(a.eventKey).localeCompare(String(b.eventKey)));
      let priorCumulative = signedCategoryMap();
      for (const walletRow of rows) {
        const snapshot = walletRow.walletAllocation || {};
        const cumulative = signedCategoryMap();
        for (const category of ledgerCategories) cumulative[category] = amountInDollars(snapshot[category]);
        const delta = signedCategoryMap();
        let totalDelta = 0;
        for (const category of ledgerCategories) {
          delta[category] = Math.max(0, cumulative[category] - priorCumulative[category]);
          totalDelta += delta[category];
        }
        priorCumulative = cumulative;
        if (!totalDelta && Number(walletRow.amount) > 0 && !Object.values(snapshot).some((value: any) => Number(value) > 0)) {
          const sourcePayment: any = paymentById.get(sourcePaymentId);
          const walletCategory: string = String(sourcePayment?.allocation?.walletCreditCategory || "");
          const walletCategories: string[] = Array.isArray(sourcePayment?.allocation?.walletCreditCategories) ? sourcePayment.allocation.walletCreditCategories : [];
          const fallback: InvoiceLedgerCategory = walletCategory === "rent" || walletCategory === "utilities" || walletCategory === "deposit"
            ? walletCategory
            : walletCategories.includes("rent") ? "rent" : walletCategories.includes("utilities") ? "utilities" : "other";
          delta[fallback] = amountInDollars(walletRow.amount);
          totalDelta = delta[fallback];
        }
        const directByEvent = directWalletByWalletEvent.get(String(walletRow.eventKey || "")) || signedCategoryMap();
        const sourcePayment: any = paymentById.get(sourcePaymentId);
        for (const category of ledgerCategories) {
          let remaining = Math.max(0, delta[category] - positiveMinor(directByEvent[category]));
          const target = sourcePayment?.tenantInvoiceId ? String(sourcePayment.tenantInvoiceId) : "";
          const invoiceCategories = category === "other" ? ["penalty", "other"] as InvoiceChargeCategory[] : [category as InvoiceChargeCategory];
          for (const itemCategory of invoiceCategories) {
            if (!remaining) break;
            remaining = allocateToInvoices(remaining, itemCategory, { paymentId: sourcePaymentId, reference: walletRow.reference, occurredAt: walletRow.createdAt, source: "wallet", targetInvoiceId: target || undefined });
          }
        }
      }
    }

    const nowKey = businessDateKey(new Date());
    for (const invoice of allInvoices) {
      const id = String(invoice._id);
      const totalCategories = invoiceChargeTotals.get(id) || invoiceCategoryTotals(invoice);
      const totalMinor = invoiceCategories.reduce((sum, category) => sum + totalCategories[category], 0);
      const paidCategories = invoiceCategoryPaid.get(id) || { rent: 0, utilities: 0, deposit: 0, penalty: 0, other: 0 };
      const paidMinor = Math.min(totalMinor, invoiceCategories.reduce((sum, category) => sum + paidCategories[category], 0));
      const balanceMinor = Math.max(0, totalMinor - paidMinor);
      let status = String(invoice.status || "issued");
      if (status === "issued" || status === "partially_paid" || status === "paid" || status === "overdue") {
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        status = balanceMinor <= 0 ? "paid" : dueDate && businessDateKey(dueDate) < nowKey ? "overdue" : paidMinor > 0 ? "partially_paid" : "issued";
      }
      const allocationRows = invoiceAllocations.get(id) || [];
      const walletCreditAppliedMinor = allocationRows.filter((row) => row.source === "wallet" && !row.reversal).reduce((sum, row) => sum + row.amountMinor, 0)
        - allocationRows.filter((row) => row.source === "wallet" && row.reversal).reduce((sum, row) => sum + row.amountMinor, 0);
      const reversedAmountMinor = allocationRows.filter((row) => row.reversal).reduce((sum, row) => sum + row.amountMinor, 0);
      const categoryPaidMinor = Object.fromEntries(invoiceCategories.map((category) => [category, Math.max(0, paidCategories[category])])) as Record<InvoiceChargeCategory, number>;
      output.set(id, serializeTenantInvoice({
        ...invoice, totalMinor, amountPaidMinor: paidMinor, balanceMinor, walletCreditAppliedMinor: Math.max(0, walletCreditAppliedMinor),
        originalInvoiceTotalMinor: originalInvoiceTotals.get(id) ?? totalCategories.rent + totalCategories.utilities + totalCategories.deposit + totalCategories.penalty + totalCategories.other,
        reversedAmountMinor, categoryTotalsMinor: totalCategories, categoryPaidMinor, status, paymentAllocations: allocationRows,
        displayItems: chargeSnapshot(invoice, eventsByInvoice.get(id) || []).items,
      }));
    }
  }

  return invoices.map((invoice) => output.get(String(invoice._id)) || serializeTenantInvoice(invoice));
}

export function serializeTenantInvoice(invoice: any) {
  const totalMinor = Number(invoice.totalMinor) || 0;
  const amountPaidMinor = Number(invoice.amountPaidMinor) || 0;
  const balanceMinor = Math.max(0, Number(invoice.balanceMinor ?? totalMinor - amountPaidMinor));
  return {
    ...invoice,
    _id: invoice._id?.toString?.() || String(invoice._id || ""),
    issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString() : null,
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString() : null,
    createdAt: invoice.createdAt ? new Date(invoice.createdAt).toISOString() : null,
    updatedAt: invoice.updatedAt ? new Date(invoice.updatedAt).toISOString() : null,
    originalInvoiceTotalMinor: Number(invoice.originalInvoiceTotalMinor ?? totalMinor),
    total: totalMinor / 100,
    amountPaid: amountPaidMinor / 100,
    walletCreditApplied: Number(invoice.walletCreditAppliedMinor || 0) / 100,
    balanceDue: balanceMinor / 100,
  };
}

export function validObjectId(value: unknown): value is string {
  return typeof value === "string" && ObjectId.isValid(value);
}

function eventBase(invoice: any, eventKey: string, kind: TenantInvoiceLedgerKind, extra: Record<string, unknown>) {
  return {
    eventKey, kind, invoiceId: String(invoice._id), tenantId: String(invoice.tenantId), propertyId: String(invoice.propertyId),
    landlordId: String(invoice.landlordId), occurredAt: new Date(), createdAt: new Date(), ...extra,
  };
}

export async function recordTenantInvoiceCharges(db: Db, invoice: any) {
  await ensureLedgerIndexes(db);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const snapshotItems = items.map((item: any) => ({
    description: String(item.description || "Charge"), quantity: Number(item.quantity) || 1,
    unitAmount: positiveMinor(item.unitAmount), amount: positiveMinor(item.amount), category: invoiceCategory(item.category),
  }));
  const snapshotKey = `invoice:${invoice._id}:charges:v1`;
  await db.collection("tenantInvoiceLedger").updateOne(
    { eventKey: snapshotKey },
    { $setOnInsert: eventBase(invoice, snapshotKey, "CHARGE_SNAPSHOT", { items: snapshotItems, amountMinor: snapshotItems.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0) }) },
    { upsert: true },
  );
  for (let index = 0; index < (invoice.adjustments || []).length; index++) {
    const adjustment = invoice.adjustments[index];
    const adjustmentId = String(adjustment.eventId || adjustment._id || `${index}-${new Date(adjustment.createdAt || 0).getTime()}`);
    await db.collection("tenantInvoiceLedger").updateOne(
      { eventKey: `invoice:${invoice._id}:adjustment:${adjustmentId}` },
      { $setOnInsert: eventBase(invoice, `invoice:${invoice._id}:adjustment:${adjustmentId}`, "CHARGE_ADJUSTMENT", { adjustmentId, category: invoiceCategory(adjustment.category), description: String(adjustment.description || "Adjustment"), amountMinor: amountMinor(adjustment.amountMinor), reason: String(adjustment.reason || "") }) },
      { upsert: true },
    );
  }
}

async function invoiceSnapshot(db: Db, tenantId: string, propertyId: string) {
  const rows = await db.collection("tenantInvoices").find({ tenantId, propertyId, status: { $nin: ["draft", "cancelled", "voided", "superseded"] } }).sort({ billingPeriod: 1, dueDate: 1, _id: 1 }).toArray();
  return addInvoicePaymentStates(db, rows);
}

const categoryRemainder = (invoice: any, category: InvoiceChargeCategory) => {
  const total = positiveMinor(invoice.categoryTotalsMinor?.[category] ?? invoiceCategoryTotals(invoice)[category]);
  const paid = positiveMinor(invoice.categoryPaidMinor?.[category]);
  return Math.max(0, total - paid);
};

async function appendInvoiceAllocations(db: Db, invoices: any[], amountByLedgerCategory: Record<InvoiceLedgerCategory, number>, extra: { sourcePaymentId?: string; sourceWalletEventKey?: string; reference?: string; occurredAt?: Date | string; targetInvoiceId?: string; kind: "PAYMENT_ALLOCATION" | "WALLET_APPLIED" }) {
  let allocations = 0;
  const candidates = [...invoices].sort((a, b) => invoiceOrderKey(a).localeCompare(invoiceOrderKey(b)) || String(a._id).localeCompare(String(b._id)));
  if (extra.targetInvoiceId) candidates.sort((a, b) => String(a._id) === extra.targetInvoiceId ? -1 : String(b._id) === extra.targetInvoiceId ? 1 : 0);
  for (const ledgerCategory of ledgerCategories) {
    let remaining = positiveMinor(amountByLedgerCategory[ledgerCategory]);
    const categories = ledgerCategory === "other" ? ["penalty", "other"] as InvoiceChargeCategory[] : [ledgerCategory as InvoiceChargeCategory];
    for (const invoice of candidates) for (const category of categories) {
      if (!remaining) break;
      const [current] = await addInvoicePaymentStates(db, [invoice]);
      const applied = Math.min(categoryRemainder(current, category), remaining);
      if (applied <= 0) continue;
      const sourceKey = extra.sourceWalletEventKey || String(extra.sourcePaymentId || "");
      const eventKey = `${extra.kind === "WALLET_APPLIED" ? "wallet" : "payment"}:${sourceKey}:invoice:${invoice._id}:${category}`;
      const result = await db.collection("tenantInvoiceLedger").updateOne(
        { eventKey },
        { $setOnInsert: eventBase(invoice, eventKey, extra.kind, { category, amountMinor: applied, sourcePaymentId: extra.sourcePaymentId || null, sourceWalletEventKey: extra.sourceWalletEventKey || null, reference: extra.reference || null, occurredAt: extra.occurredAt ? new Date(extra.occurredAt) : new Date() }) },
        { upsert: true },
      );
      if (result.upsertedCount) logger.info(extra.kind === "WALLET_APPLIED" ? "Tenant invoice wallet credit applied" : "Tenant invoice payment allocated", { invoiceId: String(invoice._id), sourcePaymentId: extra.sourcePaymentId, category, amountMinor: applied });
      remaining -= applied;
      allocations += applied;
    }
  }
  return allocations;
}

export async function recordTenantInvoicePaymentAllocations(db: Db, payment: any) {
  if (!payment?.tenantId || !payment?.propertyId || !ObjectId.isValid(String(payment._id))) return 0;
  const allocation = payment.allocation || {};
  const pool = { rent: amountInDollars(allocation.rent), utilities: amountInDollars(allocation.utilities), deposit: amountInDollars(allocation.deposit), other: amountInDollars(allocation.other) };
  if (!Object.values(pool).some((amount) => amount > 0)) return 0;
  let invoices = await invoiceSnapshot(db, String(payment.tenantId), String(payment.propertyId));
  if (!invoices.length) return 0;
  const targetInvoiceId = payment.tenantInvoiceId ? String(payment.tenantInvoiceId) : "";
  if (!targetInvoiceId) {
    const paymentDate = paymentEventDate(payment);
    if (paymentDate) {
      invoices = invoices.filter((invoice: any) => {
        if (!isAutomaticTenantDuesInvoice(invoice)) return true;
        const invoiceDate = invoice.issueDate || invoice.createdAt;
        const issuedAt = invoiceDate ? new Date(invoiceDate) : null;
        // An automatic dues invoice is a snapshot of the balance at creation.
        // A late posting must not retroactively pay a snapshot created after
        // the receipt, because that receipt was already included in its total.
        return !issuedAt || Number.isNaN(issuedAt.getTime()) || paymentDate >= issuedAt;
      });
    }
  }
  if (!invoices.length) return 0;
  await ensureLedgerIndexes(db);
  return appendInvoiceAllocations(db, invoices, pool, {
    sourcePaymentId: String(payment._id), reference: payment.mpesaCode || payment.reference || payment.transactionId,
    occurredAt: payment.postedAt || payment.paymentDate || new Date(), targetInvoiceId: targetInvoiceId || undefined,
    kind: "PAYMENT_ALLOCATION",
  });
}

async function synchronizeTenantInvoiceWalletAllocations(db: Db, tenantId: string, payments: Map<string, any>, allocations: ReadonlyMap<string, any>, syncKey: string) {
  for (const [sourcePaymentId, allocation] of allocations) {
    const payment = payments.get(sourcePaymentId);
    if (!payment?.propertyId) continue;
    const invoices = await invoiceSnapshot(db, tenantId, String(payment.propertyId));
    if (!invoices.length) continue;
    const events = await db.collection("tenantInvoiceLedger").find({
      sourcePaymentId,
      kind: { $in: ["WALLET_APPLIED", "WALLET_ALLOCATION_REVERSED"] },
    }).toArray();
    const current = signedCategoryMap();
    const reversedByWalletEvent = new Map<string, number>();
    const walletEventCategoryKey = (event: any) => `${String(event.sourceWalletEventKey || "")}:${String(event.invoiceId || "")}:${invoiceCategory(event.category)}`;
    for (const event of events) {
      const category = ledgerCategoryFor(invoiceCategory(event.category));
      const amount = positiveMinor(event.amountMinor);
      if (event.kind === "WALLET_APPLIED") current[category] += amount;
      else {
        current[category] -= amount;
        const walletKey = walletEventCategoryKey(event);
        reversedByWalletEvent.set(walletKey, (reversedByWalletEvent.get(walletKey) || 0) + amount);
      }
    }
    for (const category of ledgerCategories) current[category] = Math.max(0, current[category]);
    for (const category of ledgerCategories) {
      const desired = amountInDollars(allocation.walletAllocation?.[category]);
      if (desired > current[category]) {
        const amount = signedCategoryMap();
        amount[category] = (desired - current[category]) / 100;
        await appendInvoiceAllocations(db, invoices, amount, {
          sourcePaymentId,
          sourceWalletEventKey: `${syncKey}:wallet-reallocation:${sourcePaymentId}:${category}:${desired}`,
          reference: payment.reference || payment.transactionId,
          occurredAt: new Date(),
          targetInvoiceId: payment.tenantInvoiceId ? String(payment.tenantInvoiceId) : undefined,
          kind: "WALLET_APPLIED",
        });
        continue;
      }
      let remaining = Math.max(0, current[category] - desired);
      if (!remaining) continue;
      const appliedRows = events.filter((event) => event.kind === "WALLET_APPLIED" && ledgerCategoryFor(invoiceCategory(event.category)) === category)
        .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime() || String(b._id).localeCompare(String(a._id)));
      for (const row of appliedRows) {
        if (!remaining) break;
        const walletKey = walletEventCategoryKey(row);
        const usable = Math.max(0, positiveMinor(row.amountMinor) - (reversedByWalletEvent.get(walletKey) || 0));
        const applied = Math.min(remaining, usable);
        if (!applied) continue;
        const eventKey = `${syncKey}:wallet-reallocation-reversal:${sourcePaymentId}:${row.eventKey}`;
        const inserted = await db.collection("tenantInvoiceLedger").updateOne(
          { eventKey },
          { $setOnInsert: eventBase({ _id: row.invoiceId, tenantId, propertyId: payment.propertyId, landlordId: payment.landlordId || payment.ownerId }, eventKey, "WALLET_ALLOCATION_REVERSED", {
            category: invoiceCategory(row.category), amountMinor: applied, sourcePaymentId, sourceWalletEventKey: row.sourceWalletEventKey || null,
            sourceReversalKey: syncKey, reference: payment.reference || payment.transactionId || null, occurredAt: new Date(),
          }) },
          { upsert: true },
        );
        if (inserted.upsertedCount) logger.info("Tenant invoice wallet allocation reconciled", { invoiceId: String(row.invoiceId), sourcePaymentId, amountMinor: applied, category });
        reversedByWalletEvent.set(walletKey, (reversedByWalletEvent.get(walletKey) || 0) + applied);
        remaining -= applied;
      }
    }
  }
}

export async function recordTenantInvoiceWalletAllocations(db: Db, tenantId: string, currentAllocations?: ReadonlyMap<string, any>, syncKey?: string) {
  const activeInvoices = await db.collection("tenantInvoices").find({
    tenantId: { $in: identityValues(tenantId) }, status: { $nin: ["draft", "cancelled", "voided", "superseded"] },
  }).limit(1).toArray();
  if (!activeInvoices.length) return 0;
  await ensureLedgerIndexes(db);
  const payments = await db.collection("payments").find({ tenantId: { $in: identityValues(tenantId) } }).project({ _id: 1, propertyId: 1, tenantInvoiceId: 1, allocation: 1, reference: 1, transactionId: 1 }).toArray();
  const paymentById = new Map(payments.map((payment: any) => [String(payment._id), payment]));
  const walletRows = await db.collection("walletTransactions").find({ tenantId: { $in: identityValues(tenantId) }, kind: "CREDIT_CONSUMED" }).sort({ createdAt: 1, _id: 1 }).toArray();
  const prior = new Map<string, Record<InvoiceLedgerCategory, number>>();
  let totalApplied = 0;
  for (const row of walletRows) {
    const sourcePaymentId = String(row.sourcePaymentId || "");
    const payment: any = paymentById.get(sourcePaymentId);
    if (!sourcePaymentId || !payment || !payment.propertyId) continue;
    const snapshot = row.walletAllocation || {};
    const previous = prior.get(sourcePaymentId) || signedCategoryMap();
    const delta = signedCategoryMap();
    for (const category of ledgerCategories) delta[category] = Math.max(0, amountInDollars(snapshot[category]) - previous[category]);
    prior.set(sourcePaymentId, Object.fromEntries(ledgerCategories.map((category) => [category, amountInDollars(snapshot[category])])) as Record<InvoiceLedgerCategory, number>);
    if (!Object.values(delta).some((amount) => amount > 0)) continue;
    const invoices = await invoiceSnapshot(db, tenantId, String(payment.propertyId));
    if (!invoices.length) continue;
    totalApplied += await appendInvoiceAllocations(db, invoices, delta, {
      sourcePaymentId, sourceWalletEventKey: String(row.eventKey || row._id), reference: row.reference || payment.reference || payment.transactionId,
      occurredAt: row.createdAt || new Date(), targetInvoiceId: payment.tenantInvoiceId ? String(payment.tenantInvoiceId) : undefined,
      kind: "WALLET_APPLIED",
    });
  }
  if (currentAllocations && syncKey) await synchronizeTenantInvoiceWalletAllocations(db, tenantId, paymentById, currentAllocations, syncKey);
  return totalApplied;
}

export async function recordTenantInvoicePaymentReversal(db: Db, payment: any, reversal: any) {
  await ensureLedgerIndexes(db);
  const sourcePaymentId = String(payment?._id || "");
  if (!sourcePaymentId || !reversal?.eventKey) return 0;
  const rows = await db.collection("tenantInvoiceLedger").find({ sourcePaymentId, kind: { $in: ["PAYMENT_ALLOCATION", "WALLET_APPLIED"] } }).sort({ occurredAt: -1, _id: -1 }).toArray();
  const alreadyReversed = await db.collection("tenantInvoiceLedger").find({ sourceReversalKey: String(reversal.eventKey), kind: { $in: ["PAYMENT_ALLOCATION_REVERSED", "WALLET_ALLOCATION_REVERSED"] } }).toArray();
  const reversalAllocation = reversal.allocation || {};
  const available = { rent: amountInDollars(reversalAllocation.rent), utilities: amountInDollars(reversalAllocation.utilities), deposit: amountInDollars(reversalAllocation.deposit), other: amountInDollars(reversalAllocation.other) };
  const walletBreakdown = reversalAllocation.walletAllocation || {};
  const walletAvailable = { rent: amountInDollars(walletBreakdown.rent), utilities: amountInDollars(walletBreakdown.utilities), deposit: amountInDollars(walletBreakdown.deposit), other: amountInDollars(walletBreakdown.other) };
  if (!Object.values(walletAvailable).some((value) => value > 0) && rows.some((row) => row.kind === "WALLET_APPLIED")) {
    const consumedRows = await db.collection("walletTransactions").find({
      tenantId: { $in: identityValues(payment.tenantId) }, sourcePaymentId: { $in: identityValues(sourcePaymentId) }, kind: "CREDIT_CONSUMED",
    }).toArray();
    const consumed = calculateWalletConsumedAllocation(consumedRows, payment.allocation?.walletCreditCategory);
    const originalAmount = Number(payment.postedAmount ?? payment.amount) || 0;
    const ratio = originalAmount > 0 ? Math.min(1, Math.max(0, (Number(reversal.amount) || 0) / originalAmount)) : 0;
    for (const category of ledgerCategories) walletAvailable[category] = amountInDollars(consumed[category] * ratio);
  }
  for (const existing of alreadyReversed) {
    const value = positiveMinor(existing.amountMinor);
    if (existing.kind === "WALLET_ALLOCATION_REVERSED") {
      const category = ledgerCategoryFor(invoiceCategory(existing.category));
      walletAvailable[category] = Math.max(0, walletAvailable[category] - value);
    }
    else {
      const category = ledgerCategoryFor(invoiceCategory(existing.category));
      available[category] = Math.max(0, available[category] - value);
    }
  }
  let reversed = 0;
  for (const row of rows) {
    const category = invoiceCategory(row.category);
    const ledgerCategory = ledgerCategoryFor(category);
    const isWallet = row.kind === "WALLET_APPLIED";
    const amount = isWallet ? walletAvailable[ledgerCategory] : available[ledgerCategory];
    const remaining = positiveMinor(amount);
    if (!remaining) continue;
    const priorReversedRows = await db.collection("tenantInvoiceLedger").find({ sourcePaymentId, invoiceId: String(row.invoiceId), category, kind: isWallet ? "WALLET_ALLOCATION_REVERSED" : "PAYMENT_ALLOCATION_REVERSED" }).toArray();
    const priorReversed = priorReversedRows.reduce((sum: number, item: any) => sum + positiveMinor(item.amountMinor), 0);
    const usable = Math.max(0, positiveMinor(row.amountMinor) - priorReversed);
    const applied = Math.min(remaining, usable);
    if (!applied) continue;
    const kind = isWallet ? "WALLET_ALLOCATION_REVERSED" : "PAYMENT_ALLOCATION_REVERSED";
    const eventKey = `${reversal.eventKey}:invoice:${row.invoiceId}:${row.eventKey}`;
    const result = await db.collection("tenantInvoiceLedger").updateOne(
      { eventKey },
      { $setOnInsert: eventBase({ _id: row.invoiceId, tenantId: payment.tenantId, propertyId: payment.propertyId, landlordId: payment.landlordId || payment.ownerId }, eventKey, kind, { category, amountMinor: applied, sourcePaymentId, sourceWalletEventKey: row.sourceWalletEventKey || null, sourceReversalKey: String(reversal.eventKey), reference: reversal.providerReference || null, occurredAt: reversal.postedAt || new Date() }) },
      { upsert: true },
    );
    if (result.upsertedCount) logger.info("Tenant invoice payment reversed", { invoiceId: String(row.invoiceId), sourcePaymentId, amountMinor: applied, category });
    if (isWallet) walletAvailable[ledgerCategory] -= applied; else available[ledgerCategory] -= applied;
    reversed += applied;
  }
  return reversed;
}

/** Original issued manual line items become payment-allocation obligations. */
export async function getManualTenantInvoiceChargeTotals(db: Db, tenantId: string, propertyId: string, asOf = new Date()) {
  const rows = await db.collection("tenantInvoices").find({
    tenantId: { $in: identityValues(tenantId) }, propertyId: { $in: identityValues(propertyId) },
    status: { $nin: ["draft", "cancelled", "voided", "superseded"] }, invoiceBasis: { $ne: "overdue_tenant_dues_v1" },
    $or: [{ issueDate: { $lte: asOf } }, { issueDate: null }, { issueDate: { $exists: false } }],
  }).toArray();
  const totals: Record<InvoiceChargeCategory, number> = { rent: 0, utilities: 0, deposit: 0, penalty: 0, other: 0 };
  const calculated = await addInvoicePaymentStates(db, rows);
  for (const row of calculated) {
    if (isAutomaticTenantDuesInvoice(row)) continue;
    for (const category of invoiceCategories) totals[category] += positiveMinor(row.categoryTotalsMinor?.[category]);
  }
  return totals;
}

export async function getManualTenantInvoiceChargeObligations(db: Db, tenantId: string, propertyId: string, asOf = new Date()) {
  const rows = await db.collection("tenantInvoices").find({
    tenantId: { $in: identityValues(tenantId) }, propertyId: { $in: identityValues(propertyId) },
    status: { $nin: ["draft", "cancelled", "voided", "superseded"] }, invoiceBasis: { $ne: "overdue_tenant_dues_v1" },
    $or: [{ issueDate: { $lte: asOf } }, { issueDate: null }, { issueDate: { $exists: false } }],
  }).sort({ dueDate: 1, billingPeriod: 1, _id: 1 }).toArray();
  const calculated = await addInvoicePaymentStates(db, rows);
  return calculated.filter((invoice: any) => !isAutomaticTenantDuesInvoice(invoice)).map((invoice: any) => ({
    invoiceId: String(invoice._id),
    billingPeriod: String(invoice.billingPeriodLabel || invoice.billingPeriod || "Manual charge"),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate) : asOf,
    categories: invoiceCategories.reduce((categories, category) => {
      categories[category] = positiveMinor(invoice.categoryTotalsMinor?.[category]);
      return categories;
    }, { rent: 0, utilities: 0, deposit: 0, penalty: 0, other: 0 } as Record<InvoiceChargeCategory, number>),
  }));
}

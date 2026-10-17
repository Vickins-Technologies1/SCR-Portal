import { Db, ObjectId } from "mongodb";
import { resolveTenantMonthlyRentForDate } from "./utils";
import { Tenant } from "../types/tenant";
import { fetchActiveRentOverridesByPropertyIds } from "./rent-overrides";
import type { AccountTier } from "./tier";
import { getOwnerInvoicePaymentProvider } from "./owner-integrations";
import { getFinancialPaymentRows, type FinancialPaymentRow } from "./financial-reporting";
import { isSuccessfulPaymentStatus } from "./payment-query";

export type BillingPlan = "RentCollection" | "FullManagement" | "Airbnb";

export const SOFTWARE_LEASING_PERCENT = 1;

export async function getSoftwareLeasingPercentage(db: Db): Promise<number> {
  const setting = await db.collection<any>("systemSettings").findOne({ _id: "softwareLeasingPercentage" } as any);
  const value = Number(setting?.value);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : SOFTWARE_LEASING_PERCENT;
}

export function resolveBillingPlan(input: { billingType?: BillingPlan; unitTypes?: { managementType?: string }[] }): BillingPlan {
  if (input.billingType && (input.billingType === "RentCollection" || input.billingType === "FullManagement")) {
    return input.billingType;
  }
  const hasFullManagement = input.unitTypes?.some((u) => u.managementType === "FullManagement");
  return hasFullManagement ? "FullManagement" : "RentCollection";
}

export function getBillingMonth(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const BILLING_TIME_ZONE = "Africa/Nairobi";

/** Nairobi calendar month, independent of the host/server timezone. */
export function getFullManagementBillingMonth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function getFullManagementBillingMonthRange(date: Date = new Date()) {
  const billingMonth = getFullManagementBillingMonth(date);
  const [year, month] = billingMonth.split("-").map(Number);
  // Nairobi is UTC+03:00 year-round. Use half-open bounds to avoid host locale
  // behavior and month-boundary ambiguity in Mongo date comparisons.
  return {
    billingMonth,
    start: new Date(Date.UTC(year, month - 1, 1) - 3 * 60 * 60 * 1000),
    end: new Date(Date.UTC(year, month, 1) - 3 * 60 * 60 * 1000),
  };
}

export async function computeActualMonthlyRentReceived(db: Db, propertyId: string, date: Date = new Date()): Promise<number> {
  if (!propertyId) return 0;
  const { start, end } = getFullManagementBillingMonthRange(date);
  const rows = await getFinancialPaymentRows({ db, propertyIds: [propertyId], start, end: new Date(end.getTime() - 1) });
  return sumFullManagementRentReceived(rows);
}

export function sumFullManagementRentReceived(rows: FinancialPaymentRow[]): number {
  const seen = new Set<string>();
  return roundCurrency(rows.reduce((sum, row) => {
    const payment = row.payment || {};
    if (!isSuccessfulPaymentStatus(payment.status)) return sum;
    const providerReference = payment.providerTransactionId || payment.transactionId || payment.mpesaCode || payment.reference;
    const key = providerReference
      ? `${String(payment.provider || "")}:${String(providerReference)}`
      : String(payment._id);
    if (seen.has(key)) return sum;
    seen.add(key);
    return sum + Math.max(0, Number(row.allocation.rent) || 0);
  }, 0));
}

/** Full Management has its own write path so Software Leasing keeps its expected-income pricing. */
export async function upsertFullManagementInvoice(params: {
  db: Db;
  userId: string;
  propertyId: string;
  percentage: number;
  actualRentReceived: number;
  description: string;
  expiresAt: Date;
  now?: Date;
  metadata?: Record<string, unknown>;
}) {
  const { db, userId, propertyId, percentage, description, expiresAt } = params;
  const now = params.now ?? new Date();
  const metadata = params.metadata ?? {};
  const { billingMonth } = getFullManagementBillingMonthRange(now);
  const actualRentReceived = roundCurrency(Math.max(0, Number(params.actualRentReceived) || 0));
  const amount = roundCurrency((actualRentReceived * percentage) / 100);
  const invoices = db.collection("invoices");
  const existing = await invoices.findOne({
    userId,
    propertyId,
    billingPlan: "FullManagement",
    billingMonth,
  });

  if (existing) {
    if (!["pending", "unpaid", "overdue", "draft"].includes(String(existing.status || "").toLowerCase())) {
      return { action: "skipped" as const, amount, billingMonth, invoiceId: existing._id.toString() };
    }
    // Once any posted payment is linked, retain the historical invoice and
    // let the auditable correction workflow handle a discrepancy.
    const linkedRows = await getFinancialPaymentRows({ db, invoiceIds: [String(existing._id)] });
    if (linkedRows.some((row) => row.originalAmount > 0)) {
      return { action: "skipped" as const, amount, billingMonth, invoiceId: existing._id.toString() };
    }
    const legacyProvider = existing.paymentProvider ? {} : { paymentProvider: await getOwnerInvoicePaymentProvider(db, userId) };
    const changed = Number(existing.amount || 0) !== amount
      || Number(existing.actualRentReceived ?? existing.expectedIncome ?? 0) !== actualRentReceived
      || Number(existing.percentage || 0) !== percentage
      || existing.actualRentReceived == null
      || existing.pricingBasis !== "actual_rent_received";
    if (!changed && existing.description === description) {
      return { action: "skipped" as const, amount, billingMonth, invoiceId: existing._id.toString() };
    }
    const update: Record<string, unknown> = {
      $set: { amount, updatedAt: now, description, expectedIncome: actualRentReceived, actualRentReceived, pricingBasis: "actual_rent_received", percentage, billingPlan: "FullManagement", expiresAt, ...legacyProvider, ...metadata },
    };
    if (changed) {
      update.$push = {
        pricingRecalculationHistory: {
          at: now,
          source: "full_management_actual_rent_recalculation",
          previousAmount: Number(existing.amount || 0),
          correctedAmount: amount,
          previousRentBasis: Number(existing.actualRentReceived ?? existing.expectedIncome ?? 0),
          previousPercentage: Number(existing.percentage || 0),
          actualRentReceived,
          percentage,
        },
      };
    }
    await invoices.updateOne({ _id: existing._id, status: existing.status }, update);
    return { action: "updated" as const, amount, billingMonth, invoiceId: existing._id.toString() };
  }

  // A zero fee is represented by no new payable invoice. Existing unpaid
  // invoices above are still corrected to zero when recalculated.
  if (amount <= 0) return { action: "skipped" as const, amount, billingMonth };

  const paymentProvider = await getOwnerInvoicePaymentProvider(db, userId);
  const reference = `FM-${propertyId}-${billingMonth}-${Date.now()}`;
  const result = await invoices.insertOne({
    userId,
    propertyId,
    unitType: "All Units",
    amount,
    status: "pending",
    reference,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    description,
    billingMonth,
    billingPlan: "FullManagement",
    percentage,
    expectedIncome: actualRentReceived,
    actualRentReceived,
    pricingBasis: "actual_rent_received",
    paymentProvider,
    ...metadata,
  } as any);
  return { action: "created" as const, amount, billingMonth, invoiceId: result.insertedId.toString() };
}

export function getGracePeriodEndDate(propertyCreatedAt: Date, now: Date = new Date(), graceDays = 5): Date {
  const createdAt = new Date(propertyCreatedAt);
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = createdAt.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const baseDay = Math.min(day, lastDayOfMonth);

  const baseDate = new Date(year, month, baseDay, 23, 59, 59, 999);
  const dueDate = new Date(baseDate);
  dueDate.setDate(dueDate.getDate() + graceDays);
  return dueDate;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function computeExpectedMonthlyIncome(db: Db, propertyId: string, now: Date = new Date()): Promise<number> {
  if (!ObjectId.isValid(propertyId)) return 0;

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const tenants = await db.collection<Tenant>("tenants").find({
    propertyId,
    status: { $ne: "inactive" },
  }).toArray();

  if (tenants.length === 0) return 0;

  const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [propertyId]);
  const total = tenants.reduce((sum, tenant) => {
    const leaseStart = tenant.leaseStartDate ? new Date(tenant.leaseStartDate) : null;
    const leaseEnd = tenant.leaseEndDate ? new Date(tenant.leaseEndDate) : null;
    if (!leaseStart || !leaseEnd || Number.isNaN(leaseStart.getTime()) || Number.isNaN(leaseEnd.getTime())) {
      return sum;
    }
    if (leaseStart > endOfMonth || leaseEnd < startOfMonth) {
      return sum;
    }
    const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
      tenant,
      date: now,
      rentOverrideMap,
    });
    return sum + effectiveMonthlyRent;
  }, 0);

  return total;
}

export async function getOwnerDueStatus(db: Db, ownerId: string, now: Date = new Date()) {
  const properties = await db.collection("properties").find({ ownerId }).toArray();
  const pendingInvoices = await db.collection("invoices").find({
    userId: ownerId,
    status: { $in: ["pending", "unpaid", "overdue"] },
  }).toArray();

  if (properties.length === 0 || pendingInvoices.length === 0) {
    return {
      isDue: false,
      pendingInvoices: pendingInvoices.length,
      dueProperties: [] as { propertyId: string; propertyName: string; dueDate: string }[],
    };
  }

  const propertyMap = new Map<string, { name?: string; createdAt?: Date }>();
  properties.forEach((property: any) => {
    propertyMap.set(property._id.toString(), {
      name: property.name,
      createdAt: property.createdAt ? new Date(property.createdAt) : undefined,
    });
  });

  const airbnbListings = await db
    .collection("airbnbListings")
    .find({ ownerId })
    .project({ externalId: 1, name: 1 })
    .toArray();

  const airbnbListingMap = new Map<string, string>();
  airbnbListings.forEach((listing: any) => {
    const key = listing.externalId || listing._id?.toString?.();
    if (key) {
      airbnbListingMap.set(String(key), listing.name || "Airbnb Listing");
    }
  });

  const pendingByProperty = new Set(pendingInvoices.map((inv: any) => inv.propertyId?.toString()));
  const dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] = [];
  const duePropertyIds = new Set<string>();

  for (const invoice of pendingInvoices as any[]) {
    const propertyId = invoice.propertyId?.toString();
    if (!propertyId || !pendingByProperty.has(propertyId)) continue;

    const propertyInfo = propertyMap.get(propertyId);
    const isAirbnbInvoice = invoice.billingPlan === "Airbnb";
    const fallbackDate = propertyInfo?.createdAt || now;
    const invoiceDue = invoice.expiresAt ? new Date(invoice.expiresAt) : getGracePeriodEndDate(fallbackDate, now);
    if (Number.isNaN(invoiceDue.getTime())) {
      continue;
    }

    if (now > invoiceDue) {
      if (!duePropertyIds.has(propertyId)) {
        dueProperties.push({
          propertyId,
          propertyName: isAirbnbInvoice
            ? (airbnbListingMap.get(propertyId) || "Airbnb Listing")
            : (propertyInfo?.name || "Property"),
          dueDate: invoiceDue.toISOString(),
        });
        duePropertyIds.add(propertyId);
      }
    }
  }

  return {
    isDue: dueProperties.length > 0,
    pendingInvoices: pendingInvoices.length,
    dueProperties,
  };
}

export async function resolveEffectiveOwnerTier(params: {
  db: Db;
  ownerId: string;
  planTier: AccountTier;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const dueStatus = await getOwnerDueStatus(params.db, params.ownerId, now);
  return {
    effectiveTier: (dueStatus.isDue ? "free" : params.planTier) as AccountTier,
    isDue: dueStatus.isDue,
    dueStatus,
  };
}

export async function upsertPercentageInvoice(params: {
  db: Db;
  userId: string;
  propertyId: string;
  billingPlan: BillingPlan;
  percentage: number;
  expectedIncome: number;
  description: string;
  expiresAt: Date;
  now?: Date;
  metadata?: Record<string, unknown>;
}) {
  const {
    db,
    userId,
    propertyId,
    billingPlan,
    percentage,
    expectedIncome,
    description,
    expiresAt,
  } = params;
  const now = params.now ?? new Date();
  const metadata = params.metadata ?? {};
  const billingMonth = getBillingMonth(now);
  const amount = roundCurrency((expectedIncome * percentage) / 100);

  if (amount <= 0) {
    return { action: "skipped" as const, amount, billingMonth };
  }

  const existingPending = await db.collection("invoices").findOne({
    userId,
    propertyId,
    billingMonth,
    status: { $in: ["pending", "unpaid", "overdue"] },
  });

  if (existingPending) {
    const legacyProvider = existingPending.paymentProvider ? {} : { paymentProvider: await getOwnerInvoicePaymentProvider(db, userId) };
    await db.collection("invoices").updateOne(
      { _id: existingPending._id },
      {
        $set: {
          amount,
          updatedAt: now,
          description,
          expectedIncome,
          percentage,
          billingPlan,
          expiresAt,
          ...legacyProvider,
          ...metadata,
        },
      }
    );
    return { action: "updated" as const, amount, billingMonth, invoiceId: existingPending._id.toString() };
  }

  const paymentProvider = await getOwnerInvoicePaymentProvider(db, userId);

  const referencePrefix =
    billingPlan === "FullManagement"
      ? "FM"
      : billingPlan === "Airbnb"
        ? "AB"
        : "SL";
  const reference = `${referencePrefix}-${propertyId}-${billingMonth}-${Date.now()}`;

  const result = await db.collection("invoices").insertOne({
    userId,
    propertyId,
    unitType: "All Units",
    amount,
    status: "pending",
    reference,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    description,
    billingMonth,
    billingPlan,
    percentage,
    expectedIncome,
    paymentProvider,
    ...metadata,
  } as any);

  return { action: "created" as const, amount, billingMonth, invoiceId: result.insertedId.toString() };
}

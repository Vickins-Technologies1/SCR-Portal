import { Db, ObjectId } from "mongodb";
import { resolveTenantMonthlyRentForDate } from "./utils";
import { Tenant } from "../types/tenant";
import { fetchActiveRentOverridesByPropertyIds } from "./rent-overrides";

export type BillingPlan = "RentCollection" | "FullManagement" | "Airbnb";

export const SOFTWARE_LEASING_PERCENT = 1;

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
  const billingMonth = getBillingMonth(now);
  const amount = roundCurrency((expectedIncome * percentage) / 100);

  if (amount <= 0) {
    return { action: "skipped" as const, amount, billingMonth };
  }

  const existingPending = await db.collection("invoices").findOne({
    userId,
    propertyId,
    billingMonth,
    status: "pending",
  });

  if (existingPending) {
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
        },
      }
    );
    return { action: "updated" as const, amount, billingMonth, invoiceId: existingPending._id.toString() };
  }

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
  } as any);

  return { action: "created" as const, amount, billingMonth, invoiceId: result.insertedId.toString() };
}

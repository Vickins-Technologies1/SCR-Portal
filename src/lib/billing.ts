import { Db, ObjectId } from "mongodb";

export type BillingPlan = "RentCollection" | "FullManagement";

export const SOFTWARE_LEASING_PERCENT = 3;

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

  const results = await db.collection("tenants").aggregate([
    { $match: { propertyId, status: { $ne: "inactive" } } },
    {
      $addFields: {
        leaseStart: { $toDate: "$leaseStartDate" },
        leaseEnd: { $toDate: "$leaseEndDate" },
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            { $lte: ["$leaseStart", endOfMonth] },
            { $gte: ["$leaseEnd", startOfMonth] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$price", 0] } },
      },
    },
  ]).toArray();

  return results[0]?.total || 0;
}

export async function getOwnerDueStatus(db: Db, ownerId: string, now: Date = new Date()) {
  const properties = await db.collection("properties").find({ ownerId }).toArray();
  const pendingInvoices = await db.collection("invoices").find({ userId: ownerId, status: "pending" }).toArray();

  if (properties.length === 0 || pendingInvoices.length === 0) {
    return {
      isDue: false,
      pendingInvoices: pendingInvoices.length,
      dueProperties: [] as { propertyId: string; propertyName: string; dueDate: string }[],
    };
  }

  const pendingByProperty = new Set(pendingInvoices.map((inv: any) => inv.propertyId));
  const dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] = [];

  for (const property of properties) {
    const propertyId = property._id.toString();
    if (!pendingByProperty.has(propertyId)) continue;

    const createdAt = property.createdAt ? new Date(property.createdAt) : now;
    const dueDate = getGracePeriodEndDate(createdAt, now);

    if (now > dueDate) {
      dueProperties.push({
        propertyId,
        propertyName: property.name || "Property",
        dueDate: dueDate.toISOString(),
      });
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

  const reference = `${billingPlan === "FullManagement" ? "FM" : "SL"}-${propertyId}-${billingMonth}-${Date.now()}`;

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

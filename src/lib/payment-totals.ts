// src/lib/payment-totals.ts
import { Db, ObjectId } from "mongodb";

export interface TenantPaymentTotals {
  rentPaid: number;
  depositPaid: number;
  utilityPaid: number;
  totalPaid: number;
}

const toTenantIdString = (tenantId: string | ObjectId) =>
  typeof tenantId === "string" ? tenantId : tenantId.toString();

export const getTenantPaymentTotals = async (
  db: Db,
  tenantId: string | ObjectId
): Promise<TenantPaymentTotals> => {
  const tenantIdStr = toTenantIdString(tenantId);
  const tenantIdentities: Array<string | ObjectId> = [tenantIdStr];
  if (ObjectId.isValid(tenantIdStr)) tenantIdentities.push(new ObjectId(tenantIdStr));
  const rows = await db.collection("payments").find({
    tenantId: { $in: tenantIdentities },
    status: "completed",
    $or: [
      { financialPostingStatus: { $in: ["posted", "processing"] } },
      { financialPostingStatus: { $exists: false } },
    ],
  }).project({ amount: 1, postedAmount: 1, type: 1, allocation: 1 }).toArray();
  const totals: TenantPaymentTotals = { rentPaid: 0, depositPaid: 0, utilityPaid: 0, totalPaid: 0 };
  for (const row of rows) {
    const effectiveAmount = Number(row.postedAmount ?? row.amount) || 0;
    const allocation = row.allocation;
    if (allocation) {
      totals.rentPaid += Number(allocation.rent) || 0;
      totals.depositPaid += Number(allocation.deposit) || 0;
      totals.utilityPaid += Number(allocation.utilities) || 0;
    } else if (row.type === "Rent") totals.rentPaid += effectiveAmount;
    else if (row.type === "Deposit") totals.depositPaid += effectiveAmount;
    else if (row.type === "Utility") totals.utilityPaid += effectiveAmount;
    totals.totalPaid += effectiveAmount;
  }
  totals.rentPaid = Math.round(totals.rentPaid * 100) / 100;
  totals.depositPaid = Math.round(totals.depositPaid * 100) / 100;
  totals.utilityPaid = Math.round(totals.utilityPaid * 100) / 100;
  totals.totalPaid = Math.round(totals.totalPaid * 100) / 100;
  return totals;
};

export const getPaymentTotalsByTenantIds = async (
  db: Db,
  tenantIds: Array<string | ObjectId>
): Promise<Map<string, TenantPaymentTotals>> => {
  if (tenantIds.length === 0) return new Map();
  const tenantIdStrings = tenantIds.map(toTenantIdString);
  const tenantIdentities = [
    ...tenantIdStrings,
    ...tenantIdStrings.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)),
  ];

  const rows = await db.collection("payments").find({
    tenantId: { $in: tenantIdentities },
    status: "completed",
    $or: [
      { financialPostingStatus: { $in: ["posted", "processing"] } },
      { financialPostingStatus: { $exists: false } },
    ],
  }).project({ tenantId: 1, amount: 1, postedAmount: 1, type: 1, allocation: 1 }).toArray();

  const totalsByTenant = new Map<string, TenantPaymentTotals>();
  for (const row of rows) {
    const tenantId = String(row.tenantId);
    const existing = totalsByTenant.get(tenantId) ?? {
      rentPaid: 0,
      depositPaid: 0,
      utilityPaid: 0,
      totalPaid: 0,
    };
    const effectiveAmount = Number(row.postedAmount ?? row.amount) || 0;
    if (row.allocation) {
      existing.rentPaid += Number(row.allocation.rent) || 0;
      existing.depositPaid += Number(row.allocation.deposit) || 0;
      existing.utilityPaid += Number(row.allocation.utilities) || 0;
    } else if (row.type === "Rent") existing.rentPaid += effectiveAmount;
    else if (row.type === "Deposit") existing.depositPaid += effectiveAmount;
    else if (row.type === "Utility") existing.utilityPaid += effectiveAmount;
    existing.totalPaid += effectiveAmount;
    totalsByTenant.set(tenantId, existing);
  }

  for (const [tenantId, totals] of totalsByTenant.entries()) {
    totals.rentPaid = Math.round(totals.rentPaid * 100) / 100;
    totals.depositPaid = Math.round(totals.depositPaid * 100) / 100;
    totals.utilityPaid = Math.round(totals.utilityPaid * 100) / 100;
    totals.totalPaid = Math.round(totals.totalPaid * 100) / 100;
    totalsByTenant.set(tenantId, totals);
  }

  return totalsByTenant;
};

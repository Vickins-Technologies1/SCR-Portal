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

const buildTotals = (rows: Array<{ _id: string; total: number }>): TenantPaymentTotals => {
  const totals: TenantPaymentTotals = {
    rentPaid: 0,
    depositPaid: 0,
    utilityPaid: 0,
    totalPaid: 0,
  };

  for (const row of rows) {
    if (row._id === "Rent") totals.rentPaid = row.total;
    else if (row._id === "Deposit") totals.depositPaid = row.total;
    else if (row._id === "Utility") totals.utilityPaid = row.total;
  }

  totals.totalPaid = totals.rentPaid + totals.depositPaid + totals.utilityPaid;
  return totals;
};

export const getTenantPaymentTotals = async (
  db: Db,
  tenantId: string | ObjectId
): Promise<TenantPaymentTotals> => {
  const tenantIdStr = toTenantIdString(tenantId);
  const rows = await db
    .collection("payments")
    .aggregate<{ _id: string; total: number }>([
      { $match: { tenantId: tenantIdStr, status: "completed" } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ])
    .toArray();

  return buildTotals(rows);
};

export const getPaymentTotalsByTenantIds = async (
  db: Db,
  tenantIds: Array<string | ObjectId>
): Promise<Map<string, TenantPaymentTotals>> => {
  if (tenantIds.length === 0) return new Map();
  const tenantIdStrings = tenantIds.map(toTenantIdString);

  const rows = await db
    .collection("payments")
    .aggregate<{ _id: { tenantId: string; type: string }; total: number }>([
      { $match: { tenantId: { $in: tenantIdStrings }, status: "completed" } },
      {
        $group: {
          _id: { tenantId: "$tenantId", type: "$type" },
          total: { $sum: "$amount" },
        },
      },
    ])
    .toArray();

  const totalsByTenant = new Map<string, TenantPaymentTotals>();
  for (const row of rows) {
    const tenantId = row._id.tenantId;
    const existing = totalsByTenant.get(tenantId) ?? {
      rentPaid: 0,
      depositPaid: 0,
      utilityPaid: 0,
      totalPaid: 0,
    };
    if (row._id.type === "Rent") existing.rentPaid = row.total;
    else if (row._id.type === "Deposit") existing.depositPaid = row.total;
    else if (row._id.type === "Utility") existing.utilityPaid = row.total;
    totalsByTenant.set(tenantId, existing);
  }

  for (const [tenantId, totals] of totalsByTenant.entries()) {
    totals.totalPaid = totals.rentPaid + totals.depositPaid + totals.utilityPaid;
    totalsByTenant.set(tenantId, totals);
  }

  return totalsByTenant;
};

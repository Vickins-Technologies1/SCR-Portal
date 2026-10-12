import { Db, ObjectId } from "mongodb";
import { getFinancialPaymentRows } from "@/lib/financial-reporting";
import { money } from "@/lib/payment-query";

export interface TenantPaymentTotals {
  rentPaid: number;
  depositPaid: number;
  utilityPaid: number;
  totalPaid: number;
}

function emptyTotals(): TenantPaymentTotals {
  return { rentPaid: 0, depositPaid: 0, utilityPaid: 0, totalPaid: 0 };
}

function addRow(totals: TenantPaymentTotals, row: Awaited<ReturnType<typeof getFinancialPaymentRows>>[number]) {
  totals.rentPaid += row.allocation.rent;
  totals.depositPaid += row.allocation.deposit;
  totals.utilityPaid += row.allocation.utilities;
  totals.totalPaid += row.netAmount;
}

export const getTenantPaymentTotals = async (
  db: Db,
  tenantId: string | ObjectId,
): Promise<TenantPaymentTotals> => {
  const totals = emptyTotals();
  const rows = await getFinancialPaymentRows({ db, tenantIds: [tenantId] });
  for (const row of rows) addRow(totals, row);
  totals.rentPaid = money(totals.rentPaid);
  totals.depositPaid = money(totals.depositPaid);
  totals.utilityPaid = money(totals.utilityPaid);
  totals.totalPaid = money(totals.totalPaid);
  return totals;
};

export const getPaymentTotalsByTenantIds = async (
  db: Db,
  tenantIds: Array<string | ObjectId>,
): Promise<Map<string, TenantPaymentTotals>> => {
  const totalsByTenant = new Map<string, TenantPaymentTotals>();
  if (!tenantIds.length) return totalsByTenant;

  const rows = await getFinancialPaymentRows({ db, tenantIds });
  for (const row of rows) {
    const tenantId = String(row.payment.tenantId || "");
    if (!tenantId) continue;
    const totals = totalsByTenant.get(tenantId) || emptyTotals();
    addRow(totals, row);
    totalsByTenant.set(tenantId, totals);
  }

  for (const totals of totalsByTenant.values()) {
    totals.rentPaid = money(totals.rentPaid);
    totals.depositPaid = money(totals.depositPaid);
    totals.utilityPaid = money(totals.utilityPaid);
    totals.totalPaid = money(totals.totalPaid);
  }
  return totalsByTenant;
};

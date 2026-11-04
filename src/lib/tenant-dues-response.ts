import { resolveTenantMonthlyRentForDate } from "@/lib/utils";
import type { TenantFinancialState } from "@/lib/tenant-payment-allocation";

export function buildTenantDuesResponse(
  tenant: any,
  state: TenantFinancialState,
  today: Date,
  rentOverrideMap: Map<string, any>
) {
  const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
    tenant,
    date: today,
    rentOverrideMap,
  });

  const dues = {
    rentDues: Math.max(0, state.rentOutstanding + state.penalties),
    rentOutstanding: state.rentOutstanding,
    rentOverdueDues: state.overdueRent,
    rentCurrentDues: Math.max(0, state.rentOutstanding - state.overdueRent),
    penaltyDues: state.penalties,
    depositDues: state.depositOutstanding,
    utilityDues: state.utilitiesOutstanding,
    utilityCurrentDues: state.utilitiesCurrentOutstanding,
    utilityOverdueDues: state.utilitiesOverdueOutstanding,
    utilityStatus: state.utilityStatus,
    overdueAmount: state.overdueAmount,
    otherDues: 0,
    totalRemainingDues: state.totalOutstanding,
    totalPaid: state.rentPaid + state.utilitiesPaid + state.depositPaid + state.otherPaid + state.walletBalance,
    walletApplied: state.walletApplied,
    walletRemaining: state.walletBalance,
    walletCoverageMonths: effectiveMonthlyRent ? Math.floor(state.walletBalance / effectiveMonthlyRent) : 0,
    walletCoverageRemainder: effectiveMonthlyRent ? state.walletBalance % effectiveMonthlyRent : state.walletBalance,
  };

  return {
    tenant: {
      ...tenant,
      _id: tenant._id.toString(),
      totalRentPaid: state.rentPaid,
      totalDepositPaid: state.depositPaid,
      totalUtilityPaid: state.utilitiesPaid,
      totalOtherPaid: state.otherPaid,
      walletBalance: state.walletBalance,
      paymentStatus: state.overdueAmount > 0 ? "overdue" : "up-to-date",
      updatedAt: today.toISOString(),
      dues,
    },
    dues,
    monthsStayed: state.monthsStayed,
  };
}

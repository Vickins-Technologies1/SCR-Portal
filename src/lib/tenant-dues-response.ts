import { resolveTenantMonthlyRentForDate } from "@/lib/utils";
import type { TenantFinancialState } from "@/lib/tenant-payment-allocation";
import { money } from "@/lib/payment-query";

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
  const walletAppliedAllocation = [...(state.paymentAllocations?.values?.() || [])].reduce((summary, allocation) => {
    for (const field of ["rent", "utilities", "deposit", "other"] as const) {
      summary[field] = money(summary[field] + Number(allocation.walletAllocation?.[field] || 0));
    }
    return summary;
  }, { rent: 0, utilities: 0, deposit: 0, other: 0 });
  const walletRentEligibleBalance = state.walletRentEligibleBalance ?? state.walletBalance;
  const paymentStatus = state.overdueAmount > 0
    ? "overdue"
    : state.totalOutstanding <= 0
      ? "paid"
      : "current";

  const dues = {
    rentDues: Math.max(0, state.rentOutstanding + state.penalties),
    rentOutstanding: state.rentOutstanding,
    rentOverdueDues: state.overdueRent,
    rentCurrentDues: Math.max(0, state.rentOutstanding - state.overdueRent),
    rentCharged: state.rentCharged,
    rentPaid: state.rentPaid,
    rentCollectionRate: state.rentCharged > 0 ? Math.round((state.rentPaid / state.rentCharged) * 100) : 100,
    expectedMonthlyRent: effectiveMonthlyRent,
    penaltyDues: state.penalties,
    depositRequired: state.depositRequired,
    depositDues: state.depositOutstanding,
    utilityDues: state.utilitiesOutstanding,
    utilityCurrentDues: state.utilitiesCurrentOutstanding,
    utilityOverdueDues: state.utilitiesOverdueOutstanding,
    utilityStatus: state.utilityStatus,
    overdueAmount: state.overdueAmount,
    otherDues: state.otherOutstanding,
    totalRemainingDues: state.totalOutstanding,
    totalPaid: money(state.rentPaid + state.utilitiesPaid + state.depositPaid + state.otherPaid + state.walletBalance),
    walletApplied: state.walletApplied,
    walletAppliedAllocation,
    walletRemaining: state.walletBalance,
    walletRentEligibleBalance,
    walletCoverageMonths: effectiveMonthlyRent ? Math.floor(walletRentEligibleBalance / effectiveMonthlyRent) : 0,
    walletCoverageRemainder: effectiveMonthlyRent ? walletRentEligibleBalance % effectiveMonthlyRent : walletRentEligibleBalance,
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
      walletRentEligibleBalance,
      expectedMonthlyRent: effectiveMonthlyRent,
      paymentStatus,
      dues,
    },
    dues,
    monthsStayed: state.monthsStayed,
  };
}

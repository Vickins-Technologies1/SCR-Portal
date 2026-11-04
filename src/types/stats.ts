// src/types/stats.ts
export interface OwnerStats {
  activeProperties: number;
  totalTenants: number;
  activeTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  expectedMonthlyRent: number;
  totalMonthlyRent: number;
  totalRentPaid: number;
  totalDepositDue: number;
  overduePayments: number;
  totalPayments: number;
  totalOverdueAmount: number;
  totalPenaltyAmount: number;
  totalDepositPaid: number;
  totalUtilityPaid: number;
  totalExpectedRent: number;
  totalRentOutstanding: number;
  totalOverdueRent: number;
  totalExpectedUtilities: number;
  totalUtilitiesOutstanding: number;
  totalOverdueUtilities: number;
  totalExpectedDeposits: number;
  totalOutstanding: number;
}

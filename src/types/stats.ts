// src/types/stats.ts
export interface OwnerStats {
  activeProperties: number;
  totalTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  expectedMonthlyRent: number;
  rentCollectedThisMonth: number;
  rentAppliedThisMonth: number;
  overduePayments: number;
  totalOverdueAmount: number;
}

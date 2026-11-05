import { describe, expect, it } from "vitest";
import type { TenantFinancialState } from "@/lib/tenant-payment-allocation";
import { summarizeTenantFinancialStates } from "./tenant-financial-view";

function state(overrides: Partial<TenantFinancialState> = {}): TenantFinancialState {
  return {
    monthsStayed: 0,
    depositRequired: 0,
    depositPaid: 0,
    depositOutstanding: 0,
    rentCharged: 0,
    rentPaid: 0,
    rentOutstanding: 0,
    utilitiesCharged: 0,
    utilitiesPaid: 0,
    otherPaid: 0,
    otherOutstanding: 0,
    utilitiesOutstanding: 0,
    utilitiesCurrentOutstanding: 0,
    utilitiesOverdueOutstanding: 0,
    utilityStatus: "PAID",
    overdueRent: 0,
    overdueUtilities: 0,
    penalties: 0,
    overdueAmount: 0,
    totalOutstanding: 0,
    walletBalance: 0,
    walletApplied: 0,
    paymentAllocations: new Map(),
    rentObligations: [],
    ...overrides,
  };
}

describe("tenant financial portfolio summaries", () => {
  it("sums independent ledgers and retains former tenant deposit balances", () => {
    const summary = summarizeTenantFinancialStates([
      state({
        rentCharged: 30_000,
        rentPaid: 24_000,
        rentOutstanding: 6_000,
        overdueRent: 4_000,
        utilitiesCharged: 2_000,
        utilitiesPaid: 1_000,
        utilitiesOutstanding: 1_000,
        overdueUtilities: 500,
        depositRequired: 20_000,
        depositPaid: 10_000,
        depositOutstanding: 10_000,
        totalOutstanding: 17_000,
      }),
      state({
        rentCharged: 20_000,
        rentPaid: 12_000,
        rentOutstanding: 8_000,
        overdueRent: 6_000,
        utilitiesCharged: 3_000,
        utilitiesPaid: 1_000,
        utilitiesOutstanding: 2_000,
        overdueUtilities: 1_500,
        depositRequired: 20_000,
        depositPaid: 5_000,
        depositOutstanding: 15_000,
        totalOutstanding: 25_000,
      }),
    ]);

    expect(summary).toMatchObject({
      expectedRent: 50_000,
      rentCollected: 36_000,
      rentOutstanding: 14_000,
      overdueRent: 10_000,
      expectedUtilities: 5_000,
      utilitiesCollected: 2_000,
      utilitiesOutstanding: 3_000,
      overdueUtilities: 2_000,
      expectedDeposits: 40_000,
      depositsReceived: 15_000,
      depositsDue: 25_000,
      totalOutstanding: 42_000,
    });
  });

  it("rounds rolled-up totals to two decimals and keeps tenant credits separate", () => {
    const summary = summarizeTenantFinancialStates([
      state({ depositRequired: 100, depositPaid: 100.50, rentOutstanding: 25.005, totalOutstanding: 25.005 }),
      state({ depositRequired: 100, depositPaid: 0, depositOutstanding: 100, rentOutstanding: 10.005, totalOutstanding: 110.005, walletBalance: 50 }),
    ]);

    expect(summary).toMatchObject({
      expectedDeposits: 200,
      depositsReceived: 100.5,
      depositsDue: 100,
      rentOutstanding: 35.01,
      totalOutstanding: 135.01,
      walletBalance: 50,
    });
  });
});

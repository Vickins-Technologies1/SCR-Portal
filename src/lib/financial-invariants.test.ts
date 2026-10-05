import { describe, expect, it } from "vitest";
import { reconcileWalletTransactions, validatePaymentInvariant } from "./financial-invariants";

describe("financial invariants", () => {
  it("rejects allocations and reversals exceeding the posted amount", () => {
    expect(validatePaymentInvariant({ postedAmount: 1000, allocation: { rent: 900, walletCredit: 200 } })).toHaveLength(1);
    expect(validatePaymentInvariant({ postedAmount: 1000, reversalTotal: 1001 })).toHaveLength(1);
  });

  it("reconstructs wallet balance from immutable transactions", () => {
    expect(reconcileWalletTransactions([
      { direction: "CREDIT", amount: 2000 },
      { direction: "DEBIT", amount: 500 },
      { direction: "CREDIT", amount: 25.5 },
    ])).toBe(1525.5);
  });
});


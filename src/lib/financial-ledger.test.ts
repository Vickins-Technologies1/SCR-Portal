import { describe, expect, it } from "vitest";
import { calculateReversalAllocation } from "./financial-ledger";
import { calculateWalletConsumedAllocation } from "./tenant-invoice-ledger";

describe("financial ledger reversal allocation", () => {
  it("supports partial reversals without changing the original payment", () => {
    expect(calculateReversalAllocation({ rent: 8000, utilities: 2000, walletCredit: 0 }, 10000, 2000)).toEqual({
      rent: 1600, utilities: 400, deposit: 0, other: 0, credit: 0, walletApplied: 0,
      walletAllocation: { rent: 0, utilities: 0, deposit: 0, other: 0 },
    });
  });

  it("caps the allocation ratio for a full reversal", () => {
    expect(calculateReversalAllocation({ rent: 8000, utilities: 2000 }, 10000, 12000)).toEqual({
      rent: 8000, utilities: 2000, deposit: 0, other: 0, credit: 0, walletApplied: 0,
      walletAllocation: { rent: 0, utilities: 0, deposit: 0, other: 0 },
    });
  });

  it("reverses consumed wallet credit proportionally by category", () => {
    expect(calculateReversalAllocation({ rent: 80, walletCredit: 10, walletApplied: 10, walletAllocation: { rent: 5, utilities: 5 } }, 100, 25)).toEqual({
      rent: 20, utilities: 0, deposit: 0, other: 0, credit: 2.5, walletApplied: 2.5,
      walletAllocation: { rent: 1.25, utilities: 1.25, deposit: 0, other: 0 },
    });
  });

  it("reconstructs consumed wallet credit from cumulative ledger snapshots", () => {
    expect(calculateWalletConsumedAllocation([
      { eventKey: "wallet-1", createdAt: "2026-01-01", amount: 30, walletAllocation: { rent: 20, utilities: 10, deposit: 0, other: 0 } },
      { eventKey: "wallet-2", createdAt: "2026-01-02", amount: 20, walletAllocation: { rent: 30, utilities: 20, deposit: 0, other: 0 } },
    ])).toEqual({ rent: 30, utilities: 20, deposit: 0, other: 0 });
  });

  it("falls back to the source credit category for legacy wallet debits", () => {
    expect(calculateWalletConsumedAllocation([{ amount: 25 }], "utilities")).toEqual({ rent: 0, utilities: 25, deposit: 0, other: 0 });
  });
});


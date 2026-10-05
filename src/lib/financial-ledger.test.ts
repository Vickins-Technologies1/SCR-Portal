import { describe, expect, it } from "vitest";
import { calculateReversalAllocation } from "./financial-ledger";

describe("financial ledger reversal allocation", () => {
  it("supports partial reversals without changing the original payment", () => {
    expect(calculateReversalAllocation({ rent: 8000, utilities: 2000, walletCredit: 0 }, 10000, 2000)).toEqual({
      rent: 1600, utilities: 400, deposit: 0, other: 0, credit: 0,
    });
  });

  it("caps the allocation ratio for a full reversal", () => {
    expect(calculateReversalAllocation({ rent: 8000, utilities: 2000 }, 10000, 12000)).toEqual({
      rent: 8000, utilities: 2000, deposit: 0, other: 0, credit: 0,
    });
  });
});


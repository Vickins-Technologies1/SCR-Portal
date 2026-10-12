import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { projectFinancialPaymentRows } from "./financial-reporting";

describe("financial report payment projection", () => {
  it("uses posted amounts, prorates allocations, and subtracts reversals", () => {
    const paymentId = new ObjectId();
    const rows = projectFinancialPaymentRows([
      {
        _id: paymentId,
        amount: 4_000,
        postedAmount: 5_000,
        type: "Rent",
        allocation: { rent: 4_000, utilities: 1_000, deposit: 0, other: 0, walletCredit: 0 },
        paymentDate: "2026-10-12T00:00:00.000Z",
      },
      { _id: new ObjectId(), amount: 2_000, status: "paid", type: "Rent", createdAt: "2026-10-11T00:00:00.000Z" },
    ], [{ _id: paymentId.toString(), total: 1_000 }]);

    expect(rows[0]).toMatchObject({ originalAmount: 5_000, reversedAmount: 1_000, netAmount: 4_000 });
    expect(rows[0].allocation).toEqual({ rent: 3_200, utilities: 800, deposit: 0, other: 0, walletCredit: 0 });
    expect(rows[1]).toMatchObject({ originalAmount: 2_000, netAmount: 2_000 });
    expect(rows[1].allocation.rent).toBe(2_000);
  });

  it("does not produce negative receipts when reversals exceed the original amount", () => {
    const paymentId = new ObjectId();
    const [row] = projectFinancialPaymentRows([{ _id: paymentId, amount: 1_000, type: "Utility" }], [{ _id: paymentId, total: 2_000 }]);
    expect(row).toMatchObject({ originalAmount: 1_000, reversedAmount: 2_000, netAmount: 0 });
    expect(row.allocation).toEqual({ rent: 0, utilities: 0, deposit: 0, other: 0, walletCredit: 0 });
  });
});

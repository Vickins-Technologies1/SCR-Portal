import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  getFinancialPaymentRows,
  categorizeFinancialPaymentRows,
  projectFinancialPaymentRows,
  summarizeFinancialPaymentPeriods,
  summarizeFinancialPaymentRows,
} from "./financial-reporting";

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

  it("uses persisted posted allocation and counts each payment document once", () => {
    const paymentId = new ObjectId();
    const first = projectFinancialPaymentRows([{
      _id: paymentId,
      amount: 1_000,
      type: "Deposit",
      allocation: { deposit: 1_000, rent: 0, utilities: 0, other: 0, walletCredit: 0 },
    }], [])[0];
    const duplicate = { ...first };
    const second = projectFinancialPaymentRows([{
      _id: new ObjectId(),
      amount: 500,
      type: "Rent",
      paymentDate: "2026-10-01T00:00:00.000Z",
    }], [])[0];
    const result = summarizeFinancialPaymentRows([first, duplicate, second]);
    expect(result).toMatchObject({
      totalReceived: 1_500,
      netReceived: 1_500,
      depositReceived: 1_000,
      rentReceived: 500,
    });
  });

  it("splits detailed report receipts into distinct ledger categories", () => {
    const paymentId = new ObjectId();
    const row = projectFinancialPaymentRows([{
      _id: paymentId,
      amount: 2_000,
      type: "Deposit",
      allocation: { deposit: 500, rent: 1_000, utilities: 300, other: 100, walletCredit: 100 },
    }], [])[0];
    const categories = categorizeFinancialPaymentRows([row]);

    expect(categories.map(({ type, amount }) => [type, amount])).toEqual([
      ["Rent", 1_000],
      ["Utility", 300],
      ["Deposit", 500],
      ["Other", 100],
      ["Wallet Credit", 100],
    ]);
    expect(categories.reduce((sum, category) => sum + category.amount, 0)).toBe(row.netAmount);
  });

  it("buckets transactions by event date at month boundaries and keeps categories distinct", () => {
    const rows = projectFinancialPaymentRows([
      { _id: new ObjectId(), amount: 100, paymentDate: "2026-09-30T20:59:59.999Z", type: "Deposit" },
      { _id: new ObjectId(), amount: 200, paymentDate: "2026-09-30T21:00:00.000Z", type: "Rent" },
      { _id: new ObjectId(), amount: 300, paymentDate: "2026-10-31T20:59:59.999Z", type: "Utility" },
      { _id: new ObjectId(), amount: 400, paymentDate: "2026-10-31T21:00:00.000Z", type: "Other" },
    ], []);
    const periods = summarizeFinancialPaymentPeriods(rows, [
      { key: "sep", start: new Date("2026-08-31T21:00:00.000Z"), end: new Date("2026-09-30T20:59:59.999Z") },
      { key: "oct", start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") },
    ]);

    expect(periods.map(({ summary }) => summary)).toMatchObject([
      { totalReceived: 100, depositReceived: 100, rentReceived: 0 },
      { totalReceived: 500, rentReceived: 200, utilityReceived: 300, depositReceived: 0 },
    ]);
  });

  it("uses each returned payment row without deduplicating provider references", async () => {
    const firstId = new ObjectId("000000000000000000000001");
    const secondId = new ObjectId("000000000000000000000002");
    const paymentRows = [
      { _id: firstId, tenantId: "tenant-1", provider: "daraja", checkoutRequestId: "Q123", amount: 10_000, status: "completed", financialPostingStatus: "posted" },
      { _id: secondId, tenantId: "tenant-1", provider: "mpesa", providerTransactionId: "Q123", amount: 10_000, status: "completed", financialPostingStatus: "posted" },
    ];
    const db = {
      collection(name: string) {
        if (name === "payments") {
          return {
            find: () => ({ sort: () => ({ toArray: async () => paymentRows }) }),
          };
        }
        if (name === "financialLedger") {
          return { aggregate: () => ({ toArray: async () => [] }) };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as any;

    const rows = await getFinancialPaymentRows({ db, tenantIds: ["tenant-1"] });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.originalAmount)).toEqual([10_000, 10_000]);
  });
});

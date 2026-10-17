import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  getFullManagementBillingMonthRange,
  sumFullManagementRentReceived,
  upsertFullManagementInvoice,
} from "./billing";
import { projectFinancialPaymentRows } from "./financial-reporting";

describe("Full Management rent-based billing", () => {
  it("sums net eligible rent across tenants and instalments, excluding other categories", () => {
    const rent1 = new ObjectId();
    const rent2 = new ObjectId();
    const reversedRent = new ObjectId();
    const [rows] = [projectFinancialPaymentRows([
      { _id: rent1, amount: 5_000, status: "completed", type: "Rent", paymentDate: "2026-10-02T08:00:00.000Z" },
      { _id: rent2, amount: 10_000, status: "paid", type: "Rent", paymentDate: "2026-10-16T08:00:00.000Z" },
      { _id: reversedRent, amount: 4_000, status: "settled", type: "Rent", paymentDate: "2026-10-20T08:00:00.000Z" },
      { _id: new ObjectId(), amount: 2_000, status: "completed", type: "Utility", paymentDate: "2026-10-20T08:00:00.000Z" },
      { _id: new ObjectId(), amount: 3_000, status: "completed", type: "Deposit", paymentDate: "2026-10-20T08:00:00.000Z" },
      { _id: new ObjectId(), amount: 7_000, status: "pending", type: "Rent", paymentDate: "2026-10-20T08:00:00.000Z" },
      { _id: new ObjectId(), amount: 8_000, status: "failed", type: "Rent", paymentDate: "2026-10-20T08:00:00.000Z" },
    ], [{ _id: reversedRent, total: 1_000 }])];

    // 8% of KES 18,000 (5,000 + 10,000 + 3,000 net reversed rent).
    expect(sumFullManagementRentReceived(rows)).toBe(18_000);
    expect(Math.round(sumFullManagementRentReceived(rows) * 0.08 * 100) / 100).toBe(1_440);
  });

  it("handles a full rent payment, partial rent, zero rent, and excludes duplicate references as ledger rows", () => {
    const rows = projectFinancialPaymentRows([
      { _id: new ObjectId(), amount: 20_000, status: "completed", type: "Rent", provider: "daraja", providerTransactionId: "TX-1" },
      { _id: new ObjectId(), amount: 20_000, status: "completed", type: "Rent", provider: "daraja", providerTransactionId: "TX-1" },
      { _id: new ObjectId(), amount: 15_000, status: "completed", type: "Rent" },
      // Utilities, deposits, penalties and unrelated income have no rent allocation.
      { _id: new ObjectId(), amount: 9_000, status: "completed", type: "Utility" },
      { _id: new ObjectId(), amount: 2_000, status: "completed", type: "Deposit" },
      { _id: new ObjectId(), amount: 1_000, status: "completed", type: "Other" },
    ], []);
    expect(sumFullManagementRentReceived(rows)).toBe(35_000);
    expect(Math.round(15_000 * 0.08 * 100) / 100).toBe(1_200);
    expect(sumFullManagementRentReceived([])).toBe(0);
    expect(sumFullManagementRentReceived([rows[0], rows[0]])).toBe(20_000);
  });

  it("uses Nairobi calendar month boundaries for payments at UTC month edges", () => {
    const range = getFullManagementBillingMonthRange(new Date("2026-10-31T22:00:00.000Z"));
    expect(range.billingMonth).toBe("2026-11");
    expect(range.start.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-30T21:00:00.000Z");
  });

  it("recalculates the same unpaid invoice idempotently and preserves paid invoices", async () => {
    const invoice = { _id: new ObjectId(), status: "pending", paymentProvider: "daraja", amount: 1_600 };
    let inserts = 0;
    let updates = 0;
    const db = {
      collection(name: string) {
        if (name === "invoices") return {
          findOne: async () => invoice,
          updateOne: async (_filter: unknown, update: any) => { updates += 1; Object.assign(invoice, update.$set); return { matchedCount: 1 }; },
          insertOne: async () => { inserts += 1; return { insertedId: new ObjectId() }; },
        };
        if (name === "payments") return { find: () => ({ sort: () => ({ toArray: async () => [] }) }) };
        if (name === "financialLedger") return { aggregate: () => ({ toArray: async () => [] }) };
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as any;

    const params = {
      db, userId: "owner", propertyId: "property", percentage: 8,
      actualRentReceived: 15_000, description: "actual rent", expiresAt: new Date("2026-11-05T00:00:00Z"),
      now: new Date("2026-10-15T12:00:00Z"),
    };
    expect((await upsertFullManagementInvoice(params)).amount).toBe(1_200);
    expect((await upsertFullManagementInvoice(params)).amount).toBe(1_200);
    expect(updates).toBe(1);
    expect(inserts).toBe(0);

    const zeroRent = await upsertFullManagementInvoice({ ...params, actualRentReceived: 0, description: "zero rent" });
    expect(zeroRent.amount).toBe(0);
    expect(invoice.amount).toBe(0);
    expect(updates).toBe(2);

    invoice.status = "paid";
    const paid = await upsertFullManagementInvoice(params);
    expect(paid.action).toBe("skipped");
    expect(updates).toBe(2);
  });
});

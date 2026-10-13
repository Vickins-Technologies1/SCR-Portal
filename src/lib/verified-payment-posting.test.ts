import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { postVerifiedPayment } from "./verified-payment-posting";

vi.mock("./tenant-payment-allocation", () => ({
  reconcileTenantPaymentAllocation: vi.fn(async () => ({})),
}));
vi.mock("./financial-reporting", () => ({
  reconcileInvoiceFinancialState: vi.fn(async () => null),
}));

describe("verified payment posting recovery", () => {
  it("replays wallet effects when the ledger insert succeeded before a failure", async () => {
    const tenantId = new ObjectId();
    const propertyId = new ObjectId();
    const payment = {
      _id: new ObjectId(),
      tenantId,
      propertyId,
      landlordId: "owner-1",
      amount: 100,
      postedAmount: 100,
      provider: "manual",
      status: "completed",
      financialPostingStatus: "processing",
      financialPostingClaimAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      allocation: { rent: 0, utilities: 0, deposit: 0, other: 0, walletCredit: 100 },
    };
    let failWalletWrite = true;
    const ledgerEvents = new Map<string, any>();
    const walletEvents = new Map<string, any>();
    const db = {
      collection(name: string) {
        if (name === "payments") {
          return {
            findOne: async () => payment,
            findOneAndUpdate: async (_query: any, update: any) => {
              Object.assign(payment, update.$set);
              return { value: { ...payment } };
            },
          };
        }
        if (name === "tenants") return { findOne: async () => ({ _id: tenantId, propertyId }) };
        if (name === "properties") return { findOne: async () => ({ _id: propertyId, ownerId: "owner-1" }) };
        if (name === "financialLedger") {
          return {
            updateOne: async (query: any, update: any) => {
              if (!ledgerEvents.has(query.eventKey)) ledgerEvents.set(query.eventKey, update.$setOnInsert);
              return { upsertedCount: 1 };
            },
          };
        }
        if (name === "walletTransactions") {
          return {
            updateOne: async (query: any, update: any) => {
              if (failWalletWrite) {
                failWalletWrite = false;
                throw new Error("temporary wallet write failure");
              }
              if (!walletEvents.has(query.eventKey)) walletEvents.set(query.eventKey, update.$setOnInsert);
              return { upsertedCount: 1 };
            },
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as any;

    await expect(postVerifiedPayment({ db, paymentId: payment._id })).rejects.toThrow("temporary wallet write failure");
    expect(ledgerEvents.size).toBe(1);
    expect(walletEvents.size).toBe(0);
    expect(payment.financialPostingStatus).toBe("processing");

    // Simulate the stale-claim window before the recovery attempt.
    payment.financialPostingClaimAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const recovered = await postVerifiedPayment({ db, paymentId: payment._id });

    expect(recovered.outcome).toBe("posted");
    expect(payment.financialPostingStatus).toBe("posted");
    expect(ledgerEvents.size).toBe(1);
    expect(walletEvents.size).toBe(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { postVerifiedPayment } from "./verified-payment-posting";

vi.mock("./tenant-payment-allocation", () => ({
  reconcileTenantPaymentAllocation: vi.fn(async () => ({})),
}));
vi.mock("./financial-reporting", () => ({
  calculateInvoiceFinancialState: vi.fn(async (_db: unknown, invoice: any) => ({ balanceDue: invoice.balanceDue ?? 0 })),
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

  it("serializes two payments targeting the same invoice", async () => {
    const invoiceId = new ObjectId();
    const invoice: any = { _id: invoiceId, amount: 100, balanceDue: 100 };
    const payments: any[] = [
      { _id: new ObjectId(), invoiceId: invoiceId.toString(), amount: 100, provider: "admin_manual", status: "completed" },
      { _id: new ObjectId(), invoiceId: invoiceId.toString(), amount: 100, providerConfirmedAmount: 100, requestedAmount: 100, provider: "daraja", status: "completed" },
    ];
    const db = {
      collection(name: string) {
        if (name === "invoices") return {
          findOneAndUpdate: async (_query: any, update: any) => {
            if (update.$set?.paymentPostingClaim && invoice.paymentPostingClaimAt) return { value: null };
            Object.assign(invoice, update.$set || {});
            for (const key of Object.keys(update.$unset || {})) delete invoice[key];
            return { ...invoice };
          },
          updateOne: async (_query: any, update: any) => {
            for (const key of Object.keys(update.$unset || {})) delete invoice[key];
            return { matchedCount: 1 };
          },
        };
        if (name === "payments") return {
          updateOne: async ({ _id }: any, update: any) => {
            const payment = payments.find((item) => item._id.equals(_id));
            if (payment) Object.assign(payment, update.$set || {});
            return { matchedCount: payment ? 1 : 0 };
          },
          findOne: async ({ _id }: any) => payments.find((payment) => payment._id.equals(_id)) || null,
          findOneAndUpdate: async ({ _id }: any, update: any) => {
            const payment = payments.find((item) => item._id.equals(_id));
            if (!payment) return { value: null };
            Object.assign(payment, update.$set || {});
            for (const key of Object.keys(update.$unset || {})) delete (payment as any)[key];
            return { ...payment };
          },
        };
        if (name === "financialLedger") return { updateOne: async () => ({ upsertedCount: 1 }) };
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as any;

    const results = await Promise.all(payments.map((payment) => postVerifiedPayment({ db, paymentId: payment._id })));
    expect(results.filter((result) => result.outcome === "posted")).toHaveLength(1);
    expect(results.every((result) => ["posted", "duplicate", "quarantined"].includes(result.outcome))).toBe(true);
    expect(payments.filter((payment) => payment.financialPostingStatus === "posted")).toHaveLength(1);
  });
});

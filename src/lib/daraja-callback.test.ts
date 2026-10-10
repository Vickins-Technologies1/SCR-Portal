import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { DarajaCallbackSchema, claimDarajaCallback, classifyDarajaResult, extractDarajaMetadata, parseDarajaTransactionDate } from "./daraja-callback";

describe("Daraja callback helpers", () => {
  it("accepts serialized result codes and nullable metadata values", () => {
    const parsed = DarajaCallbackSchema.safeParse({
      Body: { stkCallback: {
        MerchantRequestID: "merchant",
        CheckoutRequestID: "checkout",
        ResultCode: "0",
        ResultDesc: "Success",
        CallbackMetadata: { Item: [{ Name: "Amount", Value: 10 }, { Name: "PhoneNumber", Value: null }] },
      } },
    });
    expect(parsed.success).toBe(true);
  });
  it("classifies successful, cancelled, timeout, and failed results", () => {
    expect(classifyDarajaResult(0, "Success")).toBe("completed");
    expect(classifyDarajaResult(1032, "Request cancelled by user")).toBe("cancelled");
    expect(classifyDarajaResult(1037, "DS timeout")).toBe("timeout");
    expect(classifyDarajaResult(999, "Insufficient funds")).toBe("failed");
  });

  it("extracts callback metadata without requiring every item", () => {
    expect(extractDarajaMetadata([
      { Name: "Amount", Value: 2500 },
      { Name: "MpesaReceiptNumber", Value: "QAB123" },
      { Name: "PhoneNumber", Value: "254712345678" },
    ])).toEqual({ amount: 2500, receipt: "QAB123", transactionDate: undefined, phone: "254712345678" });
  });

  it("parses the provider's Kenya-local transaction timestamp as UTC", () => {
    expect(parseDarajaTransactionDate("20261010120000")?.toISOString()).toBe("2026-10-10T09:00:00.000Z");
    expect(parseDarajaTransactionDate("not-a-date")).toBeNull();
  });

  it("allows a completed callback to retry unfinished financial posting", async () => {
    const payment = {
      _id: new ObjectId(),
      status: "completed",
      financialPostingStatus: "processing",
      darajaEffectsApplied: false,
    };
    const db = {
      collection: () => ({
        findOne: async (_query: any, options?: any) => options?.projection ? null : payment,
        findOneAndUpdate: async () => ({ value: null }),
      }),
    } as any;
    const result = await claimDarajaCallback(db, {
      MerchantRequestID: "merchant",
      CheckoutRequestID: "checkout",
      ResultCode: 0,
      ResultDesc: "Success",
      CallbackMetadata: { Item: [{ Name: "Amount", Value: 100 }] },
    });
    expect(result.shouldProcessEffects).toBe(true);
    expect(result.reason).toBe("retry");
  });
});

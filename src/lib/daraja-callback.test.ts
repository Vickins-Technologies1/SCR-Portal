import { describe, expect, it } from "vitest";
import { classifyDarajaResult, extractDarajaMetadata } from "./daraja-callback";

describe("Daraja callback helpers", () => {
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
});

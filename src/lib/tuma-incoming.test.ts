import { describe, expect, it } from "vitest";
import { isLikelyMpesaReceipt, normalizeTumaStatus } from "./tuma-incoming";

describe("Tuma provider status normalization", () => {
  it("keeps successful, cancelled, failed, and pending states distinct", () => {
    expect(normalizeTumaStatus({ status: "success" })).toBe("completed");
    expect(normalizeTumaStatus({ status: "cancelled" })).toBe("cancelled");
    expect(normalizeTumaStatus({ resultCode: 1, resultDesc: "Rejected" })).toBe("failed");
    expect(normalizeTumaStatus({ status: "queued" })).toBe("pending_stk");
  });

  it("recognizes only the expected M-Pesa receipt shape", () => {
    expect(isLikelyMpesaReceipt("QAB1234567")).toBe(true);
    expect(isLikelyMpesaReceipt("short")).toBe(false);
    expect(isLikelyMpesaReceipt("not a receipt")).toBe(false);
  });
});

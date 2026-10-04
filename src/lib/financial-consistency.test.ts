import { describe, expect, it } from "vitest";
import { auditPaymentAllocations } from "./financial-consistency";

describe("financial consistency audit", () => {
  it("accepts a balanced category allocation", () => {
    expect(auditPaymentAllocations([{
      id: "p1", amount: 10_000, type: "Rent",
      allocation: { rent: 10_000, utilities: 0, deposit: 0, other: 0, walletCredit: 0 },
    }])).toEqual([]);
  });

  it("flags category shifts and amount mismatches", () => {
    const findings = auditPaymentAllocations([{
      id: "p2", amount: 10_000, type: "Rent",
      allocation: { rent: 8_000, utilities: 2_000, deposit: 0, other: 0, walletCredit: 0 },
    }]);
    expect(findings.map((finding) => finding.code)).toEqual(["EXPLICIT_CATEGORY_MISMATCH"]);
  });

  it("flags untyped records for manual historical review", () => {
    expect(auditPaymentAllocations([{ id: "legacy", amount: 500 }])[0]?.code).toBe("MISSING_CATEGORY");
  });
});

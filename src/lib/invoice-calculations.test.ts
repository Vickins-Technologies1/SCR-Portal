import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "./invoice-calculations";

const base = { amount: 950, dueDate: "2026-09-30T00:00:00.000Z", now: new Date("2026-09-28T00:00:00.000Z") };

describe("calculateInvoiceTotals", () => {
  it.each([
    [0, "DUE", 950],
    [950, "PAID", 0],
    [500, "PARTIALLY PAID", 450],
  ] as const)("calculates payment case %s", (amountPaid, status, balanceDue) => {
    expect(calculateInvoiceTotals({ ...base, amountPaid })).toMatchObject({ status, balanceDue, total: 950 });
  });

  it("marks an unpaid past-due invoice overdue", () => {
    expect(calculateInvoiceTotals({ amount: 950, amountPaid: 0, dueDate: "2026-09-27T00:00:00.000Z", now: base.now })).toMatchObject({ status: "OVERDUE", balanceDue: 950 });
  });

  it("never exposes a negative balance for overpayment", () => {
    expect(calculateInvoiceTotals({ ...base, amountPaid: 1200 })).toMatchObject({ status: "PAID", balanceDue: 0, amountPaid: 1200 });
  });
});

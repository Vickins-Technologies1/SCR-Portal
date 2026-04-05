import { describe, expect, it } from "vitest";
import { calculateReminderDueAmounts } from "./reminder-calculations";

describe("calculateReminderDueAmounts", () => {
  it("does not allow deposit overpayment to offset rent", () => {
    const result = calculateReminderDueAmounts({
      rentAmount: 1000,
      rentPaid: 0,
      depositAmount: 500,
      depositPaid: 700,
    });

    expect(result.rentDue).toBe(1000);
    expect(result.depositDue).toBe(0);
    expect(result.totalDue).toBe(1000);
  });

  it("caps negative dues at zero", () => {
    const result = calculateReminderDueAmounts({
      rentAmount: 1200,
      rentPaid: 1500,
      depositAmount: 0,
      depositPaid: 0,
    });

    expect(result.rentDue).toBe(0);
    expect(result.totalDue).toBe(0);
  });

  it("defaults utilities to zero when not provided", () => {
    const result = calculateReminderDueAmounts({
      rentAmount: 800,
      rentPaid: 200,
      depositAmount: 0,
      depositPaid: 0,
    });

    expect(result.utilityDue).toBe(0);
    expect(result.totalDue).toBe(600);
  });
});

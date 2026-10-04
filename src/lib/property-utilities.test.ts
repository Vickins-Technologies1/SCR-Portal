import { describe, expect, it } from "vitest";
import {
  calculateFixedUtilityBreakdown,
  calculateMeteredUtilityAmount,
  getUtilityDueDate,
} from "./property-utilities";

describe("property utility lifecycle calculations", () => {
  const tenant = { leaseStartDate: "2026-09-01", unitIdentifier: "A1" };

  it("calculates recorded utility usage from units and rate", () => {
    expect(calculateMeteredUtilityAmount(50, 20)).toBe(1_000);
  });

  it("keeps a fixed monthly charge separate from prior arrears", () => {
    const result = calculateFixedUtilityBreakdown({
      utilities: [{ id: "water", name: "Water", billingMode: "fixed", amount: 2_000, startsAt: "2026-09-01", active: true }],
      tenant,
      today: new Date(2026, 9, 4),
      paymentDay: 30,
    });
    expect(result.charged).toBe(4_000);
    expect(result.overdueCharged).toBe(2_000);
    expect(result.currentCharged).toBe(2_000);
  });

  it("uses the configured payment day and clamps invalid month days", () => {
    expect(getUtilityDueDate("2026-09", 30)?.getDate()).toBe(30);
    expect(getUtilityDueDate("2026-02", 31)?.getDate()).toBe(28);
  });
});

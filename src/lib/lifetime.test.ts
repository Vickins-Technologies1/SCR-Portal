import { describe, expect, it } from "vitest";
import { canUseLimit, defaultLifetimePlan, formatLimit, isUnlimitedLimit } from "./lifetime";

describe("Lifetime package configuration", () => {
  it("is explicitly one-time and never expires", () => {
    const plan = defaultLifetimePlan();
    expect(plan.planType).toBe("lifetime");
    expect(plan.billingType).toBe("one_time");
    expect(plan.subscriptionPeriod).toBe("lifetime");
    expect(plan.recurring).toBe(false);
    expect(plan.autoRenew).toBe(false);
  });

  it("treats null and -1 as unlimited", () => {
    expect(isUnlimitedLimit(null)).toBe(true);
    expect(isUnlimitedLimit(-1)).toBe(true);
    expect(formatLimit(-1)).toBe("Unlimited");
    expect(canUseLimit(-1, 100, 1000)).toBe(true);
    expect(canUseLimit(10, 10)).toBe(false);
    expect(canUseLimit(10, 9)).toBe(true);
  });
});

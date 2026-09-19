import { describe, expect, it } from "vitest";
import { calculateLifetimePriceFromPlan, canUseLimit, defaultLifetimePlan, formatLimit, isUnlimitedLimit, validateLifetimePricing } from "./lifetime";

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

  it("calculates the configured tier at every boundary", () => {
    const plan = {
      ...defaultLifetimePlan(),
      minimumUnits: 1,
      maximumUnits: 100,
      pricingTiers: [
        { minUnits: 1, maxUnits: 10, price: 10000, currency: "KES", active: true },
        { minUnits: 11, maxUnits: 20, price: 18000, currency: "KES", active: true },
        { minUnits: 21, maxUnits: 50, price: 35000, currency: "KES", active: true },
        { minUnits: 51, maxUnits: 100, price: 60000, currency: "KES", active: true },
      ],
    };

    expect(calculateLifetimePriceFromPlan(plan, 1).amount).toBe(10000);
    expect(calculateLifetimePriceFromPlan(plan, 10).amount).toBe(10000);
    expect(calculateLifetimePriceFromPlan(plan, 11).amount).toBe(18000);
    expect(calculateLifetimePriceFromPlan(plan, 20).amount).toBe(18000);
    expect(calculateLifetimePriceFromPlan(plan, 21).amount).toBe(35000);
    expect(calculateLifetimePriceFromPlan(plan, 50).amount).toBe(35000);
    expect(calculateLifetimePriceFromPlan(plan, 51).amount).toBe(60000);
    expect(calculateLifetimePriceFromPlan(plan, 100).amount).toBe(60000);
  });

  it("rejects overlaps and warns about gaps", () => {
    const result = validateLifetimePricing({
      minimumUnits: 1,
      maximumUnits: 100,
      currency: "KES",
      tiers: [
        { minUnits: 1, maxUnits: 10, price: 10000, currency: "KES", active: true },
        { minUnits: 10, maxUnits: 20, price: 18000, currency: "KES", active: true },
        { minUnits: 25, maxUnits: 100, price: 60000, currency: "KES", active: true },
      ],
    });
    expect(result.errors.some((error) => error.includes("overlap"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("gap"))).toBe(true);
  });

  it("rejects invalid unit inputs and uncovered ranges", () => {
    const plan = { ...defaultLifetimePlan(), minimumUnits: 1, maximumUnits: 10, pricingTiers: [{ minUnits: 1, maxUnits: 10, price: 10000, currency: "KES", active: true }] };
    expect(() => calculateLifetimePriceFromPlan(plan, 0)).toThrow();
    expect(() => calculateLifetimePriceFromPlan(plan, 1.5)).toThrow();
    expect(() => calculateLifetimePriceFromPlan(plan, 11)).toThrow(/contact Sorana/);
  });
});

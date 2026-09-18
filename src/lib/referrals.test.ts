import { describe, expect, it } from "vitest";
import { getEnvironmentReferralSettings, maskPayoutDestination, normalizeRewardMode } from "./referrals";

describe("referral configuration", () => {
  it("uses the configurable KSh 1,000 default payout threshold", () => {
    expect(getEnvironmentReferralSettings().minimumPayoutAmount).toBe(1000);
  });

  it("normalizes unsupported reward modes to subscription credit", () => {
    expect(normalizeRewardMode("cash_commission")).toBe("cash_commission");
    expect(normalizeRewardMode("unexpected")).toBe("subscription_credit");
  });

  it("masks payout destinations before they reach the UI", () => {
    expect(maskPayoutDestination("0712345678")).toBe("07******78");
  });
});

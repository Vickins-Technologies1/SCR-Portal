import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  eligibleFinancialPaymentFilter,
  identityValues,
  paymentAmount,
  paymentDateRangeFilter,
  paymentEventDate,
  SUCCESSFUL_PAYMENT_STATUSES,
} from "./payment-query";

describe("shared payment query rules", () => {
  it("recognizes legacy successful statuses without admitting pending payments", () => {
    expect(SUCCESSFUL_PAYMENT_STATUSES).toEqual(["completed", "successful", "success", "paid", "settled"]);
    expect(eligibleFinancialPaymentFilter()).toMatchObject({
      $and: [
        { status: { $in: SUCCESSFUL_PAYMENT_STATUSES } },
        { $or: expect.arrayContaining([
          { financialPostingStatus: { $in: ["posted", "processing", null] } },
          { financialPostingStatus: { $exists: false } },
          {
            financialPostingStatus: "pending",
            $or: [
              { postedAmount: { $exists: true, $ne: null } },
              { providerConfirmedAmount: { $exists: true, $ne: null } },
              { financialEffectsApplied: true },
            ],
          },
        ]) },
      ],
    });
  });

  it("prefers the provider-confirmed amount when a legacy row lacks postedAmount", () => {
    expect(paymentAmount({ amount: 1000, providerConfirmedAmount: 1250 })).toBe(1250);
    expect(paymentAmount({ amount: 1000, postedAmount: 1100, providerConfirmedAmount: 1250 })).toBe(1100);
  });

  it("queries legacy string and ObjectId references together", () => {
    const id = new ObjectId();
    expect(identityValues(id)).toEqual(expect.arrayContaining([id, id.toString()]));
    expect(identityValues(id.toString())).toEqual(expect.arrayContaining([id.toString(), id]));
  });

  it("uses payment event date precedence consistently", () => {
    expect(paymentEventDate({
      paymentDate: "2026-10-12T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    })?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(paymentEventDate({ createdAt: "2026-10-01T00:00:00.000Z" })?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("builds a range expression that can fall back across legacy date fields", () => {
    expect(paymentDateRangeFilter(new Date("2026-10-01T00:00:00.000Z"), new Date("2026-10-31T23:59:59.999Z"))).toMatchObject({ $expr: { $and: expect.any(Array) } });
  });
});

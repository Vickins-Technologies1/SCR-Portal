import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { calculateTenantRentDueToDate } from "@/lib/utils";
import { deriveTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { buildTenantDuesResponse } from "@/lib/tenant-dues-response";

describe("tenant dues response rent breakdown", () => {
  it("separates KES 2,000 overdue rent from KES 4,000 current rent in KES 6,000 outstanding", () => {
    const asOf = new Date("2026-11-04T00:00:00+03:00");
    const tenant = {
      _id: new ObjectId(),
      propertyId: new ObjectId().toString(),
      leaseStartDate: "2026-09-01",
      unitType: "Bedsitter",
      unitIdentifier: "Bedsitter-2",
      price: 4_000,
      deposit: 4_000,
      leasedUnits: [{ unitType: "Bedsitter", unitIdentifier: "Bedsitter-2", price: 4_000, deposit: 4_000 }],
    } as any;
    const rent = calculateTenantRentDueToDate({ tenant, today: asOf, paymentDay: 10 });
    const payment = (
      amount: number,
      type: "Rent" | "Deposit",
      paymentDate: string,
      allocation: Record<string, number>,
      status = "completed",
    ) => ({
      _id: new ObjectId(), amount, type, status, paymentDate,
      allocation: { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 0, ...allocation },
    });
    const state = deriveTenantFinancialState({
      tenant,
      asOf,
      rentDue: rent.rentDue,
      overdueRentCharged: rent.overdueRentDue,
      rentObligations: rent.obligations,
      monthsStayed: rent.monthsStayed,
      utilityBreakdown: { charged: 0, currentCharged: 0, overdueCharged: 0 },
      depositDue: 4_000,
      property: { rentPaymentDate: 10 },
      payments: [
        payment(4_000, "Deposit", "2026-08-01T00:00:00.000Z", { deposit: 4_000 }),
        payment(2_000, "Rent", "2026-09-16T00:00:00.000Z", { rent: 2_000 }),
        payment(2_000, "Rent", "2026-09-22T00:00:00.000Z", { rent: 2_000 }),
        payment(4_000, "Rent", "2026-10-30T00:00:00.000Z", { rent: 4_000 }, "reversed"),
        payment(2_000, "Rent", "2026-10-30T00:00:00.000Z", { rent: 2_000 }),
      ],
    });
    const response = buildTenantDuesResponse(tenant, state, asOf, new Map());

    expect(response.dues).toMatchObject({
      rentDues: 6_000,
      rentOutstanding: 6_000,
      rentOverdueDues: 2_000,
      rentCurrentDues: 4_000,
      overdueAmount: 2_000,
      depositDues: 0,
      utilityDues: 0,
      penaltyDues: 0,
      totalRemainingDues: 6_000,
    });
    expect(state.rentObligations.map(({ billingPeriod, paid, outstanding, overdue }) => ({
      billingPeriod, paid, outstanding, overdue,
    }))).toEqual([
      { billingPeriod: "2026-09", paid: 4_000, outstanding: 0, overdue: true },
      { billingPeriod: "2026-10", paid: 2_000, outstanding: 2_000, overdue: true },
      { billingPeriod: "2026-11", paid: 0, outstanding: 4_000, overdue: false },
    ]);
  });
});

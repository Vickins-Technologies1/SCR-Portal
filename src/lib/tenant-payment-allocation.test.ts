import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { allocatePaymentLedger, allocateUtilityPaymentAcrossCharges, deriveTenantFinancialState, sumTenantDepositPaid, sumTenantOverdueAmount, tenantOverdueStatus } from "./tenant-payment-allocation";
import { calculateTenantRentDueToDate } from "./utils";

const payment = (amount: number, id = new ObjectId(), type?: "Rent" | "Utility" | "Deposit" | "Other" | "General") => ({ _id: id, amount, status: "completed" as const, type });
describe("tenant payment allocation", () => {
  it("allocates partial, exact, and excess rent in rent-first order", () => {
    const partial = allocatePaymentLedger({ rentDue: 20_000, utilityDue: 3_000, payments: [payment(10_000)] });
    expect(partial.rentPaid).toBe(10_000);
    expect(partial.walletBalance).toBe(0);

    const exact = allocatePaymentLedger({ rentDue: 20_000, utilityDue: 3_000, payments: [payment(20_000)] });
    expect(exact.rentPaid).toBe(20_000);
    expect(exact.walletBalance).toBe(0);

    const excess = allocatePaymentLedger({ rentDue: 20_000, utilityDue: 3_000, payments: [payment(22_000)] });
    expect(excess.rentPaid).toBe(20_000);
    expect(excess.utilitiesPaid).toBe(2_000);
    expect(excess.walletBalance).toBe(0);
    expect([...excess.allocations.values()][0]).toMatchObject({ rent: 20_000, utilities: 2_000, walletCredit: 0 });
  });

  it("cascades an overpaid explicit rent payment into utility", () => {
    const result = allocatePaymentLedger({
      rentDue: 10_000,
      utilityDue: 3_000,
      payments: [payment(13_000, new ObjectId(), "Rent")],
    });
    expect(result.rentPaid).toBe(10_000);
    expect(result.utilitiesPaid).toBe(3_000);
    expect(result.walletBalance).toBe(0);
    expect(result.allocations.values().next().value).toMatchObject({ rent: 10_000, utilities: 3_000, walletCredit: 0 });
  });

  it("allocates a rent payment deposit-first regardless of declared category", () => {
    const result = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 10_000,
      utilityDue: 3_000,
      payments: [payment(13_000, new ObjectId(), "Rent")],
    });
    expect(result.depositPaid).toBe(13_000);
    expect(result.rentPaid).toBe(0);
    expect(result.utilitiesPaid).toBe(0);
    expect(result.walletBalance).toBe(0);
  });

  it.each(["Rent", "Utility", "Deposit", "Other", "General"] as const)(
    "applies the same deposit-first cascade to %s receipts",
    (type) => {
      const result = allocatePaymentLedger({
        depositDue: 500,
        rentDue: 1_000,
        utilityDue: 100,
        payments: [payment(700, new ObjectId(), type)],
      });
      expect(result.allocations.values().next().value).toMatchObject({
        deposit: 500,
        rent: 200,
        utilities: 0,
        other: 0,
        walletCredit: 0,
      });
      expect(result.depositPaid).toBe(500);
      expect(result.rentPaid).toBe(200);
      expect(result.utilitiesPaid).toBe(0);
      expect(result.walletBalance).toBe(0);
    },
  );

  it("does not let the utility category bypass rent", () => {
    const result = allocatePaymentLedger({
      rentDue: 20_000,
      utilityDue: 3_000,
      payments: [payment(2_000, new ObjectId(), "Utility")],
    });
    expect(result.rentPaid).toBe(2_000);
    expect(result.utilitiesPaid).toBe(0);
    expect(result.allocations.values().next().value).toMatchObject({ rent: 2_000, utilities: 0 });
  });

  it("clears rent before utilities even when categorized as utility", () => {
    const result = allocatePaymentLedger({
      depositDue: 0,
      rentDue: 10_000,
      utilityDue: 2_000,
      payments: [payment(5_000, new ObjectId(), "Utility")],
    });
    expect(result.utilitiesPaid).toBe(0);
    expect(result.rentPaid).toBe(5_000);
    expect(result.walletBalance).toBe(0);
    expect(result.allocations.values().next().value).toMatchObject({ rent: 5_000, utilities: 0, walletCredit: 0 });
  });

  it("cascades excess deposit payments into rent instead of wallet credit", () => {
    const result = allocatePaymentLedger({
      depositDue: 2_000,
      rentDue: 10_000,
      utilityDue: 0,
      payments: [payment(5_000, new ObjectId(), "Deposit")],
    });
    expect(result.depositPaid).toBe(2_000);
    expect(result.rentPaid).toBe(3_000);
    expect(result.walletBalance).toBe(0);
    expect(result.allocations.values().next().value).toMatchObject({ rent: 3_000, deposit: 2_000, walletCredit: 0 });
  });

  it("does not cascade before rent is fully satisfied", () => {
    const result = allocatePaymentLedger({
      rentDue: 25_000,
      utilityDue: 3_000,
      payments: [payment(5_000, new ObjectId(), "Rent")],
    });
    expect(result.rentPaid).toBe(5_000);
    expect(result.utilitiesPaid).toBe(0);
  });

  it("cascades into the oldest utility charges before wallet credit", () => {
    const allocations = allocateUtilityPaymentAcrossCharges(4_000, [
      { utilityChargeId: "sep", billingPeriod: "2026-09", amount: 2_000 },
      { utilityChargeId: "oct", billingPeriod: "2026-10", amount: 3_000 },
    ]);
    expect(allocations).toEqual([
      { utilityChargeId: "sep", billingPeriod: "2026-09", amount: 2_000 },
      { utilityChargeId: "oct", billingPeriod: "2026-10", amount: 2_000 },
    ]);
  });

  it("uses the legacy rent-first policy only for untyped/general payments", () => {
    const result = allocatePaymentLedger({
      rentDue: 20_000,
      utilityDue: 3_000,
      payments: [payment(22_000, new ObjectId(), "General")],
    });
    expect(result.rentPaid).toBe(20_000);
    expect(result.utilitiesPaid).toBe(2_000);
  });

  it("sends only the remainder to wallet after all rent and utility dues", () => {
    const result = allocatePaymentLedger({
      rentDue: 20_000,
      utilityDue: 3_000,
      payments: [payment(22_000, new ObjectId(), "Rent")],
    });
    expect(result.rentPaid).toBe(20_000);
    expect(result.utilitiesPaid).toBe(2_000);
    expect(result.walletBalance).toBe(0);
  });

  it("creates wallet credit only after rent and utility are fully satisfied", () => {
    const result = allocatePaymentLedger({
      rentDue: 10_000,
      utilityDue: 3_000,
      payments: [payment(15_000, new ObjectId(), "Rent")],
    });
    expect(result.rentPaid).toBe(10_000);
    expect(result.utilitiesPaid).toBe(3_000);
    expect(result.walletBalance).toBe(2_000);
    expect(result.allocations.values().next().value).toMatchObject({ walletCredit: 2_000 });
  });

  it("does not count a later general payment twice when wallet credit already exists", () => {
    const result = allocatePaymentLedger({
      rentDue: 20_000,
      utilityDue: 3_000,
      payments: [payment(25_000), payment(1_000)],
    });
    const rows = [...result.allocations.values()];
    expect(rows[0]).toMatchObject({ walletCredit: 2_000 });
    expect(rows[1]).toMatchObject({ walletCredit: 1_000, walletApplied: 0 });
    expect(result.walletBalance).toBe(3_000);
  });

  it("moves only genuine excess to wallet and spends it on later balances", () => {
    const result = allocatePaymentLedger({ rentDue: 20_000, utilityDue: 3_000, payments: [payment(25_000)] });
    const rows = [...result.allocations.values()];
    expect(rows[0]).toMatchObject({ rent: 20_000, utilities: 3_000, walletCredit: 2_000 });
    expect(result.walletBalance).toBe(2_000);
  });

  it("protects overdue rent and applies multiple outstanding categories before wallet", () => {
    const result = allocatePaymentLedger({
      rentDue: 30_000,
      utilityDue: 4_000,
      otherDue: 1_000,
      payments: [payment(35_000)],
    });
    expect(result.rentPaid).toBe(30_000);
    expect(result.utilitiesPaid).toBe(4_000);
    expect(result.otherPaid).toBe(1_000);
    expect(result.walletBalance).toBe(0);
  });

  it("isolates deposit, including partial and excess deposit payments", () => {
    const partial = allocatePaymentLedger({ depositDue: 20_000, rentDue: 20_000, utilityDue: 3_000, payments: [payment(10_000)] });
    expect(partial.depositPaid).toBe(10_000);
    expect([...partial.allocations.values()][0]).toMatchObject({ deposit: 10_000, rent: 0 });

    const exact = allocatePaymentLedger({ depositDue: 20_000, rentDue: 20_000, utilityDue: 3_000, payments: [payment(20_000)] });
    expect(exact.depositPaid).toBe(20_000);
    expect(exact.walletBalance).toBe(0);

    const followedByRent = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 20_000,
      utilityDue: 3_000,
      payments: [payment(20_000), payment(20_000)],
    });
    const rows = [...followedByRent.allocations.values()];
    expect(rows[1]).toMatchObject({ deposit: 0, rent: 20_000 });
    expect(followedByRent.depositPaid).toBe(20_000);
  });

  it("never reuses a fully paid deposit as utility credit", () => {
    const result = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 20_000,
      utilityDue: 3_000,
      payments: [payment(20_000), payment(25_000)],
    });
    const rows = [...result.allocations.values()];
    expect(rows[1]).toMatchObject({ deposit: 0, rent: 20_000, utilities: 3_000, walletCredit: 2_000 });
    expect(result.depositPaid).toBe(20_000);
    expect(result.walletBalance).toBe(2_000);
  });

  it("allocates a later payment across the remaining deposit and next balance", () => {
    const result = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 20_000,
      utilityDue: 0,
      payments: [payment(12_000), payment(15_000)],
    });
    const rows = [...result.allocations.values()];
    expect(rows[0]).toMatchObject({ deposit: 12_000, rent: 0 });
    expect(rows[1]).toMatchObject({ deposit: 8_000, rent: 7_000 });
    expect(result.depositPaid).toBe(20_000);
    expect(result.rentPaid).toBe(7_000);
  });

  it("does not let failed, cancelled, or reversed payments reduce balances", () => {
    const result = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 20_000,
      utilityDue: 0,
      payments: [
        { ...payment(5_000), status: "failed" },
        { ...payment(5_000), status: "cancelled" },
        { ...payment(5_000), status: "reversed" },
      ],
    });
    expect(result.depositPaid).toBe(0);
    expect(result.rentPaid).toBe(0);
  });

  it("counts every supported successful payment status in the tenant ledger", () => {
    const result = allocatePaymentLedger({
      rentDue: 5_000,
      utilityDue: 0,
      payments: [
        { ...payment(1_000), status: "successful" },
        { ...payment(1_000), status: "success" },
        { ...payment(1_000), status: "paid" },
        { ...payment(1_000), status: "settled" },
        { ...payment(1_000), status: "pending" },
      ],
    });
    expect(result.rentPaid).toBe(4_000);
  });

  it("aggregates dashboard deposits from tenant ledger results, not raw payment totals", () => {
    const tenantA = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 20_000,
      utilityDue: 0,
      payments: [payment(30_000), payment(10_000)],
    });
    const tenantB = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 20_000,
      utilityDue: 0,
      payments: [payment(10_000)],
    });

    expect(tenantA.depositPaid).toBe(20_000);
    expect(tenantA.rentPaid).toBe(20_000);
    expect(sumTenantDepositPaid([tenantA, tenantB])).toBe(30_000);
  });

  it("does not double count a tenant state when aggregating deposits", () => {
    const tenant = allocatePaymentLedger({
      depositDue: 20_000,
      rentDue: 0,
      utilityDue: 0,
      payments: [payment(30_000)],
    });

    expect(sumTenantDepositPaid([tenant])).toBe(20_000);
  });

  it("keeps deposit due and penalties out of overdue amount", () => {
    const depositOnly = { overdueRent: 0, overdueUtilities: 0, depositOutstanding: 20_000, penalties: 5_000 };
    const rentAndUtilities = { overdueRent: 10_000, overdueUtilities: 5_000, depositOutstanding: 20_000, penalties: 5_000 };

    expect(sumTenantOverdueAmount([depositOnly])).toBe(0);
    expect(sumTenantOverdueAmount([rentAndUtilities])).toBe(15_000);
  });

  it("classifies only rent and utility arrears as overdue", () => {
    expect(tenantOverdueStatus({ overdueAmount: 0 })).toBe("up-to-date");
    expect(tenantOverdueStatus({ overdueAmount: 1 })).toBe("overdue");
  });

  it("aggregates overdue rent and utilities across tenants without deposits", () => {
    expect(sumTenantOverdueAmount([
      { overdueRent: 15_000, overdueUtilities: 3_000 },
      { overdueRent: 0, overdueUtilities: 0 },
      { overdueRent: 10_000, overdueUtilities: 5_000 },
    ])).toBe(33_000);
  });

  it("derives a zero state when the tenant has no charges or payments", () => {
    const state = deriveTenantFinancialState({
      tenant: {},
      asOf: new Date("2026-10-11T00:00:00.000Z"),
      rentDue: 0,
      monthsStayed: 0,
      utilityBreakdown: { charged: 0, currentCharged: 0, overdueCharged: 0 },
      depositDue: 0,
      payments: [],
    });
    expect(state).toMatchObject({
      rentOutstanding: 0,
      utilitiesOutstanding: 0,
      depositOutstanding: 0,
      totalOutstanding: 0,
      walletBalance: 0,
      utilityStatus: "PAID",
    });
  });

  it("cascades a deposit overpayment while classifying current utilities", () => {
    const state = deriveTenantFinancialState({
      tenant: {},
      asOf: new Date("2026-10-11T00:00:00.000Z"),
      rentDue: 20_000,
      monthsStayed: 2,
      utilityBreakdown: { charged: 3_000, currentCharged: 3_000, overdueCharged: 0 },
      depositDue: 10_000,
      payments: [payment(12_000, new ObjectId(), "Deposit")],
    });
    expect(state).toMatchObject({
      monthsStayed: 2,
      depositPaid: 10_000,
      rentPaid: 2_000,
      utilitiesPaid: 0,
      depositOutstanding: 0,
      rentOutstanding: 18_000,
      utilitiesOutstanding: 3_000,
      utilitiesCurrentOutstanding: 3_000,
      utilitiesOverdueOutstanding: 0,
      utilityStatus: "CURRENT",
      totalOutstanding: 21_000,
      walletBalance: 0,
    });
  });

  it("reduces overdue utilities only by the amount actually allocated to utilities", () => {
    const state = deriveTenantFinancialState({
      tenant: {},
      asOf: new Date("2026-10-11T00:00:00.000Z"),
      rentDue: 0,
      monthsStayed: 1,
      utilityBreakdown: { charged: 5_000, currentCharged: 2_000, overdueCharged: 3_000 },
      depositDue: 0,
      payments: [payment(1_000, new ObjectId(), "Utility")],
    });
    expect(state.utilitiesPaid).toBe(1_000);
    expect(state.utilitiesOverdueOutstanding).toBe(2_000);
    expect(state.utilitiesCurrentOutstanding).toBe(2_000);
    expect(state.utilityStatus).toBe("OVERDUE");
    expect(state.overdueAmount).toBe(2_000);
  });

  it("excludes future-dated payments and applies posted reversals", () => {
    const reversedId = new ObjectId();
    const futureId = new ObjectId();
    const state = deriveTenantFinancialState({
      tenant: {},
      asOf: new Date("2026-10-11T00:00:00.000Z"),
      rentDue: 20_000,
      monthsStayed: 1,
      utilityBreakdown: { charged: 0, currentCharged: 0, overdueCharged: 0 },
      depositDue: 0,
      payments: [
        payment(10_000, reversedId, "Rent"),
        { ...payment(10_000, futureId, "Rent"), paymentDate: "2026-10-12T00:00:00.000Z" },
      ],
      reversedByPayment: new Map([[reversedId.toString(), 10_000]]),
    });
    expect(state.rentPaid).toBe(0);
    expect(state.rentOutstanding).toBe(20_000);
  });

  it("does not count pending or failed requests as rent payments", () => {
    const state = deriveTenantFinancialState({
      tenant: {},
      asOf: new Date("2026-10-11T00:00:00.000Z"),
      rentDue: 10_000,
      monthsStayed: 1,
      utilityBreakdown: { charged: 0, currentCharged: 0, overdueCharged: 0 },
      depositDue: 0,
      payments: [
        { ...payment(10_000), status: "pending" },
        { ...payment(10_000), status: "failed" },
      ],
    });

    expect(state.rentPaid).toBe(0);
    expect(state.rentOutstanding).toBe(10_000);
  });

  it("preserves historical posted category allocations when current dues change", () => {
    const result = allocatePaymentLedger({
      depositDue: 500,
      rentDue: 0,
      utilityDue: 300,
      payments: [{
        ...payment(100, new ObjectId(), "Rent"),
        allocation: { rent: 100, deposit: 0, utilities: 0, other: 0, walletCredit: 0 },
      }],
    });
    expect(result.rentPaid).toBe(100);
    expect(result.depositPaid).toBe(0);
    expect(result.utilitiesPaid).toBe(0);
    expect(result.allocations.values().next().value).toMatchObject({ rent: 100, deposit: 0, utilities: 0 });
  });

  it("computes rent overdue after the Nairobi due date and clamps February due dates", () => {
    const tenant: any = {
      leaseStartDate: "2026-10-01",
      leasedUnits: [{ unitIdentifier: "A1", unitType: "Studio", houseNumber: "A1", price: 1000, deposit: 0 }],
    };
    const before = calculateTenantRentDueToDate({ tenant, today: new Date("2026-10-03T21:00:00.000Z"), paymentDay: 5 });
    const dueDay = calculateTenantRentDueToDate({ tenant, today: new Date("2026-10-04T21:00:00.000Z"), paymentDay: 5 });
    const after = calculateTenantRentDueToDate({ tenant, today: new Date("2026-10-05T21:00:00.000Z"), paymentDay: 5 });
    expect(before.rentDue).toBe(1000);
    expect(before.overdueRentDue).toBe(0);
    expect(dueDay.overdueRentDue).toBe(0);
    expect(after.overdueRentDue).toBe(1000);

    const priorArrearsTenant = { ...tenant, leaseStartDate: "2026-09-01" };
    const currentRentNotDue = calculateTenantRentDueToDate({
      tenant: priorArrearsTenant,
      today: new Date("2026-10-03T21:00:00.000Z"),
      paymentDay: 5,
    });
    expect(currentRentNotDue.rentDue).toBe(2000);
    expect(currentRentNotDue.overdueRentDue).toBe(1000);

    const leapTenant = { ...tenant, leaseStartDate: "2024-02-01" };
    const leap = calculateTenantRentDueToDate({ tenant: leapTenant, today: new Date("2024-03-01T21:00:00.000Z"), paymentDay: 31 });
    expect(leap.overdueRentDue).toBe(1000);
  });
});

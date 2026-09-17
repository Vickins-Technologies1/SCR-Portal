import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { allocatePaymentLedger } from "./tenant-payment-allocation";

const payment = (amount: number, id = new ObjectId()) => ({ _id: id, amount, status: "completed" });
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
});

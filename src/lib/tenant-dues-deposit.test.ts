import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { calculateTenantDues, resolveTenantRequiredDeposit } from "./utils";

describe("resolveTenantRequiredDeposit", () => {
  it("resolves single-unit deposit from property unitTypes (not rent)", () => {
    const tenant = {
      deposit: 10000,
      unitType: "1B",
      unitIdentifier: "1B-0",
      leasedUnits: undefined,
    } as any;

    const unitTypes = [{ type: "1B", price: 20000, deposit: 1500, quantity: 1 }] as any;

    expect(resolveTenantRequiredDeposit({ tenant, unitTypes })).toBe(1500);
  });

  it("sums deposits for multi-unit leases using unitIdentifier mapping", () => {
    const tenant = {
      deposit: 0,
      unitType: "1B",
      unitIdentifier: "1B-0",
      leasedUnits: [
        { unitIdentifier: "1B-0", unitType: "1B", deposit: 9999 },
        { unitIdentifier: "1B-0", unitType: "1B", deposit: 9999 },
      ],
    } as any;

    const unitTypes = [{ type: "1B", price: 20000, deposit: 2000, quantity: 2 }] as any;

    expect(resolveTenantRequiredDeposit({ tenant, unitTypes })).toBe(4000);
  });

  it("falls back to tenant-stored amounts when property config is missing", () => {
    const tenant = {
      deposit: 700,
      unitType: "Studio",
      unitIdentifier: "Studio-0",
      leasedUnits: [{ unitIdentifier: "Studio-0", unitType: "Studio", deposit: 350 }],
    } as any;

    expect(resolveTenantRequiredDeposit({ tenant, unitTypes: null })).toBe(350);
  });
});

describe("calculateTenantDues (deposit)", () => {
  it("uses property deposit when provided, even if tenant.deposit is wrong", async () => {
    const tenant = {
      _id: new ObjectId(),
      ownerId: "owner",
      name: "T",
      email: "t@example.com",
      phone: "0700000000",
      password: "x",
      role: "tenant",
      propertyId: "507f1f77bcf86cd799439011",
      unitType: "1B",
      unitIdentifier: "1B-0",
      price: 20000,
      deposit: 20000, // bad legacy data (same as rent)
      houseNumber: "A1",
      leaseStartDate: "",
      leaseEndDate: "",
      status: "active",
      paymentStatus: "current",
      createdAt: new Date(),
      totalRentPaid: 0,
      totalUtilityPaid: 0,
      totalDepositPaid: 0,
      walletBalance: 0,
      deliveryMethod: "both",
    } as any;

    const dues = await calculateTenantDues({} as any, tenant, new Date("2026-04-22"), undefined, {
      propertyUnitTypes: [{ type: "1B", price: 20000, deposit: 1500, quantity: 1 }] as any,
    });

    expect(dues.depositDues).toBe(1500);
  });
});


import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { calculateTenantDues, resolveTenantRequiredDeposit } from "./utils";
import { calculateFixedUtilityDue, countUtilityBillableMonths } from "./property-utilities";

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

  it("does not reuse tenant legacy deposit when property config exists but has no deposit", () => {
    const tenant = {
      deposit: 5000,
      unitType: "Studio",
      unitIdentifier: "Studio-0",
      leasedUnits: undefined,
    } as any;

    const unitTypes = [{ type: "Studio", price: 18000, deposit: 0, quantity: 1 }] as any;

    expect(resolveTenantRequiredDeposit({ tenant, unitTypes })).toBe(0);
  });

  it("keeps zero deposit when leased unit data is stale but property config says none", () => {
    const tenant = {
      deposit: 9000,
      unitType: "1B",
      unitIdentifier: "1B-0",
      leasedUnits: [
        { unitIdentifier: "1B-0", unitType: "1B", deposit: 9000 },
      ],
    } as any;

    const unitTypes = [{ type: "1B", price: 22000, deposit: 0, quantity: 1 }] as any;

    expect(resolveTenantRequiredDeposit({ tenant, unitTypes })).toBe(0);
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

describe("utility dues", () => {
  it("counts fixed utility months from the later of lease start and utility start", () => {
    expect(
      countUtilityBillableMonths({
        leaseStartDate: "2026-01-15",
        utilityStartsAt: "2026-03-01",
        today: new Date("2026-06-11"),
      })
    ).toBe(4);
  });

  it("calculates fixed utility dues per leased unit", () => {
    const tenant = {
      leaseStartDate: "2026-04-01",
      leasedUnits: [{ unitIdentifier: "A-1" }, { unitIdentifier: "A-2" }],
    } as any;

    const amount = calculateFixedUtilityDue({
      tenant,
      today: new Date("2026-06-11"),
      utilities: [
        {
          id: "garbage",
          name: "Garbage",
          billingMode: "fixed",
          amount: 300,
          startsAt: "2026-04-01",
        },
      ],
    });

    expect(amount).toBe(1800);
  });

  it("includes fixed and metered utilities in tenant dues", async () => {
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
      price: 0,
      deposit: 0,
      houseNumber: "A1",
      leaseStartDate: "2026-05-01",
      leaseEndDate: "",
      status: "active",
      paymentStatus: "current",
      createdAt: new Date(),
      totalRentPaid: 0,
      totalUtilityPaid: 100,
      totalDepositPaid: 0,
      walletBalance: 0,
      deliveryMethod: "both",
    } as any;

    const dues = await calculateTenantDues({} as any, tenant, new Date("2026-06-11"), undefined, {
      propertyUnitTypes: [{ type: "1B", price: 0, deposit: 0, quantity: 1 }] as any,
      propertyUtilities: [
        {
          id: "security",
          name: "Security",
          billingMode: "fixed",
          amount: 500,
          startsAt: "2026-05-01",
        },
      ],
      meteredUtilityDue: 350,
    });

    expect(dues.utilityDues).toBe(1250);
  });
});

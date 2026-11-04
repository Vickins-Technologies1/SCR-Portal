import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  calculateTenantFinancialState: vi.fn(),
  fetchActiveRentOverridesByPropertyIds: vi.fn(),
  fetchTenantsActiveOnDay: vi.fn(),
  fetchTenantsOverlappingRange: vi.fn(),
  getFinancialPaymentRows: vi.fn(),
  summarizeFinancialPaymentRows: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/tenant-payment-allocation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-payment-allocation")>()),
  calculateTenantFinancialState: mocks.calculateTenantFinancialState,
}));
vi.mock("@/lib/rent-overrides", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rent-overrides")>()),
  fetchActiveRentOverridesByPropertyIds: mocks.fetchActiveRentOverridesByPropertyIds,
}));
vi.mock("@/lib/tenant-occupancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-occupancy")>()),
  fetchTenantsActiveOnDay: mocks.fetchTenantsActiveOnDay,
  fetchTenantsOverlappingRange: mocks.fetchTenantsOverlappingRange,
}));
vi.mock("@/lib/financial-reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/financial-reporting")>()),
  getFinancialPaymentRows: mocks.getFinancialPaymentRows,
  summarizeFinancialPaymentRows: mocks.summarizeFinancialPaymentRows,
}));

import { GET } from "./route";

describe("owner dashboard financial totals", () => {
  const ownerId = new ObjectId();
  const propertyId = new ObjectId();
  const activeTenant = {
    _id: new ObjectId(),
    ownerId,
    propertyId,
    leaseStartDate: "2026-01-01",
    leaseEndDate: "2027-01-01",
  };
  const formerTenant = {
    _id: new ObjectId(),
    ownerId,
    propertyId,
    leaseStartDate: "2025-01-01",
    leaseEndDate: "2025-12-31",
  };
  const property = { _id: propertyId, ownerId, status: "Active", unitTypes: [] };
  const states = new Map([
    [String(activeTenant._id), {
      depositRequired: 20_000, depositPaid: 10_000, depositOutstanding: 10_000,
      rentCharged: 30_000, rentPaid: 24_000, rentOutstanding: 6_000, overdueRent: 4_000,
      utilitiesCharged: 2_000, utilitiesPaid: 1_000, utilitiesOutstanding: 1_000, overdueUtilities: 1_000,
      totalOutstanding: 17_000, overdueAmount: 5_000, penalties: 0,
    }],
    [String(formerTenant._id), {
      depositRequired: 20_000, depositPaid: 5_000, depositOutstanding: 15_000,
      rentCharged: 20_000, rentPaid: 12_000, rentOutstanding: 8_000, overdueRent: 6_000,
      utilitiesCharged: 3_000, utilitiesPaid: 1_000, utilitiesOutstanding: 2_000, overdueUtilities: 2_000,
      totalOutstanding: 25_000, overdueAmount: 8_000, penalties: 0,
    }],
  ]);
  let propertyFindFilter: any;
  let tenantBulkWrite: ReturnType<typeof vi.fn>;

  function cursor(values: any[]) {
    return { toArray: async () => values };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindFilter = null;
    tenantBulkWrite = vi.fn(async () => ({}));
    mocks.connectToDatabase.mockResolvedValue({
      db: {
        collection: (name: string) => {
          if (name === "properties") return {
            find: vi.fn((filter: any) => {
              propertyFindFilter = filter;
              return cursor([property]);
            }),
            aggregate: vi.fn(() => cursor([{ totalUnits: 1 }])),
          };
          if (name === "tenants") return {
            countDocuments: vi.fn(async () => 2),
            find: vi.fn(() => cursor([activeTenant, formerTenant])),
            bulkWrite: tenantBulkWrite,
          };
          throw new Error(`Unexpected collection ${name}`);
        },
      },
    });
    mocks.fetchActiveRentOverridesByPropertyIds.mockResolvedValue(new Map());
    mocks.fetchTenantsActiveOnDay.mockResolvedValue([activeTenant]);
    mocks.fetchTenantsOverlappingRange.mockResolvedValue([activeTenant]);
    mocks.getFinancialPaymentRows.mockResolvedValue([]);
    mocks.summarizeFinancialPaymentRows.mockReturnValue({ rentReceived: 0, netReceived: 0 });
    mocks.calculateTenantFinancialState.mockImplementation(async (_db: unknown, tenant: any) => states.get(String(tenant._id)));
  });

  it("reconciles portfolio deposits and overdue with all tenant ledger states and accepts ObjectId ownership", async () => {
    const request = new NextRequest(`https://example.test/api/ownerstats?userId=${ownerId}`, {
      headers: {
        cookie: `userId=${ownerId};role=propertyOwner;csrf-token=csrf-value`,
        "x-csrf-token": "csrf-value",
      },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(propertyFindFilter.ownerId.$in.map(String)).toEqual(expect.arrayContaining([String(ownerId)]));
    expect(data.stats).toMatchObject({
      totalDepositPaid: 15_000,
      totalDepositDue: 25_000,
      totalOverdueAmount: 13_000,
      overduePayments: 1,
    });
    expect(data.stats.totalDepositPaid + data.stats.totalDepositDue).toBe(40_000);
    expect(data.stats).toMatchObject({
      totalExpectedRent: 50_000,
      totalRentPaid: 36_000,
      totalRentOutstanding: 14_000,
      totalOverdueRent: 10_000,
      totalExpectedUtilities: 5_000,
      totalUtilityPaid: 2_000,
      totalUtilitiesOutstanding: 3_000,
      totalOverdueUtilities: 3_000,
      totalExpectedDeposits: 40_000,
      totalOutstanding: 42_000,
    });
    expect(tenantBulkWrite).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

const fixtures = vi.hoisted(() => ({
  ownerId: "64a000000000000000000011",
  otherOwnerId: "64a000000000000000000099",
  properties: [] as any[],
  tenants: [] as any[],
  states: new Map<string, any>(),
}));

const sumOverdue = (states: Iterable<{ overdueAmount: number }>) => {
  let totalMinor = 0;
  for (const state of states) totalMinor += Math.round((Number(state.overdueAmount) || 0) * 100);
  return totalMinor / 100;
};

const sumDepositOutstanding = (states: Iterable<{ depositOutstanding: number }>) => {
  let totalMinor = 0;
  for (const state of states) totalMinor += Math.round((Number(state.depositOutstanding) || 0) * 100);
  return totalMinor / 100;
};

vi.mock("@/lib/csrf", () => ({ validateCsrfToken: () => true, buildInvalidCsrfResponse: () => new Response("csrf", { status: 403 }) }));
vi.mock("@/lib/mongodb", () => ({
  connectToDatabase: async () => ({ db: {
    collection(name: string) {
      if (name === "properties") return {
        find: (query: any) => ({ toArray: async () => fixtures.properties.filter((property) =>
          String(property.ownerId) === String(query.ownerId) &&
          (!query._id?.$in || query._id.$in.some((id: any) => String(id) === String(property._id)))
        ) }),
        aggregate: (pipeline: any[]) => ({ toArray: async () => {
          const match = pipeline[0]?.$match || {};
          return [{ totalUnits: fixtures.properties.filter((property) => String(property.ownerId) === String(match.ownerId)).length }];
        } }),
      };
      if (name === "tenants") return {
        countDocuments: async (query: any) => fixtures.tenants.filter((tenant) => query.propertyId.$in.includes(tenant.propertyId)).length,
        find: (query: any) => ({ toArray: async () => fixtures.tenants.filter((tenant) => query.propertyId.$in.includes(tenant.propertyId)) }),
        bulkWrite: async () => ({ acknowledged: true }),
      };
      if (name === "utilityCharges") return { find: () => ({ toArray: async () => [] }) };
      throw new Error(`Unexpected collection ${name}`);
    },
  } }),
}));
vi.mock("@/lib/utils", () => ({ resolveTenantMonthlyRentForDate: () => 0 }));
vi.mock("@/lib/rent-overrides", () => ({ fetchActiveRentOverridesByPropertyIds: async () => new Map() }));
vi.mock("@/lib/tenant-payment-allocation", () => ({
  calculateTenantFinancialState: async (_db: unknown, tenant: any) => fixtures.states.get(String(tenant._id)),
  calculateTenantFinancialStates: async (_db: unknown, tenants: any[]) => tenants.map((tenant) => fixtures.states.get(String(tenant._id))),
  sumTenantDepositOutstanding: sumDepositOutstanding,
  sumTenantDepositPaid: () => 0,
  sumTenantOverdueAmount: sumOverdue,
  tenantOverdueStatus: (state: any) => state.overdueAmount > 0 ? "overdue" : "up-to-date",
}));
vi.mock("@/lib/tenant-occupancy", () => ({
  ACTIVE_PROPERTY_STATUSES: ["Active", "active"],
  buildPropertyIdCandidates: (ids: string[]) => ids,
  countOccupiedUnitsForTenant: () => 1,
  fetchTenantsActiveOnDay: async (_db: unknown, propertyIds: string[], day: Date) => fixtures.tenants.filter((tenant) =>
    propertyIds.includes(tenant.propertyId) &&
    !["terminated", "inactive", "moved out", "evicted"].includes(String(tenant.status || "").toLowerCase()) &&
    Number.isFinite(new Date(tenant.leaseStartDate).getTime()) && new Date(tenant.leaseStartDate) <= day &&
    Number.isFinite(new Date(tenant.leaseEndDate).getTime()) && new Date(tenant.leaseEndDate) >= day
  ),
  fetchTenantsOverlappingRange: async () => [],
}));
vi.mock("@/lib/financial-reporting", () => ({
  getFinancialPaymentRows: async () => [],
  summarizeFinancialPaymentRows: () => ({ rentReceived: 0, netReceived: 0, utilityReceived: 0 }),
}));
vi.mock("@/lib/business-time", () => ({ businessMonthStart: (year: number, month: number) => new Date(Date.UTC(year, month, 1)) }));

function request(propertyId?: string) {
  const url = new URL("http://localhost/api/ownerstats");
  url.searchParams.set("userId", fixtures.ownerId);
  if (propertyId) url.searchParams.set("propertyId", propertyId);
  return new NextRequest(url, { headers: { cookie: `role=propertyOwner; userId=${fixtures.ownerId}` } });
}

describe("owner stats overdue aggregation", () => {
  beforeEach(() => {
    const propertyA = new ObjectId("64a000000000000000000021");
    const propertyB = new ObjectId("64a000000000000000000022");
    const propertyOtherOwner = new ObjectId("64a000000000000000000023");
    fixtures.properties = [
      { _id: propertyA, ownerId: fixtures.ownerId, status: "Active", unitTypes: [] },
      { _id: propertyB, ownerId: fixtures.ownerId, status: "Active", unitTypes: [] },
      { _id: propertyOtherOwner, ownerId: fixtures.otherOwnerId, status: "Active", unitTypes: [] },
    ];
    fixtures.tenants = [
      { _id: new ObjectId("64a000000000000000000031"), propertyId: String(propertyA), leaseStartDate: "2026-01-01", leaseEndDate: "2027-01-01" },
      // Models an outstanding invoice with no overdue balance in the tenant ledger.
      { _id: new ObjectId("64a000000000000000000032"), propertyId: String(propertyA), leaseStartDate: "2026-01-01", leaseEndDate: "2027-01-01", outstandingInvoiceBalance: 15_000 },
      { _id: new ObjectId("64a000000000000000000033"), propertyId: String(propertyB), leaseStartDate: "2026-01-01", leaseEndDate: "2027-01-01" },
      { _id: new ObjectId("64a000000000000000000034"), propertyId: String(propertyOtherOwner), leaseStartDate: "2026-01-01", leaseEndDate: "2027-01-01" },
      { _id: new ObjectId("64a000000000000000000035"), propertyId: String(propertyA), leaseStartDate: "2026-01-01", leaseEndDate: "2026-09-01", status: "moved out" },
    ];
    fixtures.states = new Map([
      [String(fixtures.tenants[0]._id), { overdueAmount: 125.25, penalties: 0, depositOutstanding: 300.25 }],
      [String(fixtures.tenants[1]._id), { overdueAmount: 0, penalties: 20, depositOutstanding: 500 }],
      [String(fixtures.tenants[2]._id), { overdueAmount: 74.5, penalties: 0, depositOutstanding: 199.5 }],
      [String(fixtures.tenants[3]._id), { overdueAmount: 999, penalties: 0, depositOutstanding: 0 }],
      [String(fixtures.tenants[4]._id), { overdueAmount: 40, penalties: 0, depositOutstanding: 0 }],
    ]);
  });

  it("reconciles selected-property totals to the owner portfolio and excludes other landlords", async () => {
    const { GET } = await import("./route");
    const portfolioResponse = await GET(request());
    const portfolio = await portfolioResponse.json();
    const propertyResponse = await GET(request(String(fixtures.properties[0]._id)));
    const property = await propertyResponse.json();

    expect(portfolio.stats.totalOverdueAmount).toBe(239.75);
    expect(portfolio.stats.totalDepositDue).toBe(999.75);
    expect(portfolio.stats.overduePayments).toBe(3);
    expect(property.stats.totalOverdueAmount).toBe(165.25);
    expect(property.stats.totalDepositDue).toBe(800.25);
    expect(property.stats.overduePayments).toBe(2);
    expect(property.stats.totalOverdueAmount + 74.5).toBe(portfolio.stats.totalOverdueAmount);
  });
});

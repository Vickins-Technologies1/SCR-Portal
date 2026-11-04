import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  calculateTenantFinancialState: vi.fn(),
  reconcileTenantPaymentAllocation: vi.fn(),
  fetchActiveRentOverridesByPropertyIds: vi.fn(),
  getFinancialReportSummary: vi.fn(),
  fetchTenantsActiveOnDay: vi.fn(),
  countOccupiedUnitsForTenant: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/tenant-payment-allocation", () => ({
  calculateTenantFinancialState: mocks.calculateTenantFinancialState,
  reconcileTenantPaymentAllocation: mocks.reconcileTenantPaymentAllocation,
}));
vi.mock("@/lib/rent-overrides", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rent-overrides")>()),
  fetchActiveRentOverridesByPropertyIds: mocks.fetchActiveRentOverridesByPropertyIds,
}));
vi.mock("@/lib/financial-reporting", () => ({ getFinancialReportSummary: mocks.getFinancialReportSummary }));
vi.mock("@/lib/tenant-occupancy", () => ({
  fetchTenantsActiveOnDay: mocks.fetchTenantsActiveOnDay,
  countOccupiedUnitsForTenant: mocks.countOccupiedUnitsForTenant,
}));

import { GET, POST } from "./route";

describe("tenant dues owner scoping", () => {
  const ownerId = new ObjectId().toString();
  const foreignOwnerId = new ObjectId().toString();
  const tenantId = new ObjectId().toString();
  const propertyId = new ObjectId().toString();
  let teamAssignedPropertyIds = [propertyId];
  const state = {
    rentOutstanding: 6_000,
    overdueRent: 2_000,
    penalties: 0,
    depositOutstanding: 0,
    utilitiesOutstanding: 0,
    utilitiesCurrentOutstanding: 0,
    utilitiesOverdueOutstanding: 0,
    utilityStatus: "CURRENT",
    overdueAmount: 2_000,
    totalOutstanding: 6_000,
    rentPaid: 6_000,
    utilitiesPaid: 0,
    depositPaid: 0,
    otherPaid: 0,
    walletBalance: 0,
    walletApplied: 0,
    monthsStayed: 3,
  } as any;

  const tenant = {
    _id: new ObjectId(tenantId),
    ownerId,
    propertyId,
    leaseStartDate: "2026-09-01",
    leaseEndDate: "2027-08-31",
    unitType: "Studio",
    unitIdentifier: "Studio-0",
    price: 2_000,
    deposit: 0,
    leasedUnits: [{ unitType: "Studio", unitIdentifier: "Studio-0", price: 2_000, deposit: 0 }],
    dues: { overdueAmount: 6_000 },
  };
  const property = { _id: new ObjectId(propertyId), ownerId, rentPaymentDate: 1, unitTypes: [] };

  function cursor(values: any[]) {
    const result: any = {
      project: () => result,
      toArray: async () => values,
    };
    return result;
  }

  function makeDb() {
    return {
      collection: (name: string) => {
        if (name === "teamMembers") return {
          findOne: vi.fn(async () => ({ ownerId, active: true, assignedPropertyIds: teamAssignedPropertyIds })),
        };
        if (name === "tenants") return {
          findOne: vi.fn(async () => tenant),
          find: vi.fn((filter: any) => {
            const ids = filter?._id?.$in?.map((id: any) => String(id)) || [];
            return cursor(ids.includes(String(tenant._id)) ? [tenant] : []);
          }),
          updateOne: vi.fn(),
          bulkWrite: vi.fn(),
        };
        if (name === "properties") return {
          find: vi.fn(() => cursor([property])),
          findOne: vi.fn(async () => property),
          aggregate: vi.fn(() => cursor([])),
        };
        throw new Error(`Unexpected collection ${name}`);
      },
    };
  }

  function post(body: unknown, sessionUserId = ownerId, role = "propertyOwner") {
    return new NextRequest("https://example.test/api/tenants/check-dues", {
      method: "POST",
      headers: {
        cookie: `userId=${sessionUserId}; role=${role}; csrf-token=csrf-value`,
        "x-csrf-token": "csrf-value",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    teamAssignedPropertyIds = [propertyId];
    const db = makeDb();
    mocks.connectToDatabase.mockResolvedValue({ db });
    mocks.calculateTenantFinancialState.mockResolvedValue(state);
    mocks.reconcileTenantPaymentAllocation.mockResolvedValue({ financialState: state });
    mocks.fetchActiveRentOverridesByPropertyIds.mockResolvedValue(new Map());
    mocks.getFinancialReportSummary.mockResolvedValue({ netReceived: 0 });
  });

  it("returns the same calculated overdue amount for batch and single-tenant requests", async () => {
    const listResponse = await POST(post({ tenantIds: [tenantId], userId: ownerId }));
    const detailsResponse = await POST(post({ tenantId, userId: ownerId }));
    const listData = await listResponse.json();
    const detailsData = await detailsResponse.json();

    expect(listData.results[0].dues.overdueAmount).toBe(2_000);
    expect(detailsData.dues.overdueAmount).toBe(2_000);
    expect(listData.results[0].dues).toEqual(detailsData.dues);
    expect(detailsData.dues).toMatchObject({ rentDues: 6_000, rentOverdueDues: 2_000, rentCurrentDues: 4_000 });
    expect(detailsData.tenant.dues.overdueAmount).toBe(2_000);
  });

  it("does not calculate dues for tenant IDs outside the authenticated owner's properties", async () => {
    const response = await POST(post({ tenantIds: [new ObjectId().toString()], userId: ownerId }));

    expect(response.status).toBe(404);
    expect(mocks.calculateTenantFinancialState).not.toHaveBeenCalled();
  });

  it("allows team members only within their owner's assigned properties", async () => {
    const teamMemberId = new ObjectId().toString();
    const allowed = await POST(post({ tenantIds: [tenantId], userId: ownerId }, teamMemberId, "teamMember"));
    expect(allowed.status).toBe(200);

    teamAssignedPropertyIds = [new ObjectId().toString()];
    const denied = await POST(post({ tenantIds: [tenantId], userId: ownerId }, teamMemberId, "teamMember"));
    expect(denied.status).toBe(404);
  });

  it("rejects a request that supplies another owner ID", async () => {
    const response = await POST(post({ tenantId, userId: foreignOwnerId }));

    expect(response.status).toBe(403);
    expect(mocks.reconcileTenantPaymentAllocation).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner or team member for aggregate dues", async () => {
    const request = new NextRequest(`https://example.test/api/tenants/check-dues?userId=${ownerId}`, {
      headers: { cookie: `userId=${ownerId}; role=tenant; csrf-token=csrf-value`, "x-csrf-token": "csrf-value" },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("does not return aggregate dues for a different owner ID", async () => {
    const request = new NextRequest(`https://example.test/api/tenants/check-dues?userId=${foreignOwnerId}`, {
      headers: { cookie: `userId=${ownerId}; role=propertyOwner; csrf-token=csrf-value`, "x-csrf-token": "csrf-value" },
    });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });
});

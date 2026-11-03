import { describe, expect, it, vi } from "vitest";
import { countOccupiedUnitsForTenant, fetchTenantsActiveOnDay, fetchTenantsWithFinancialHistory } from "./tenant-occupancy";

describe("countOccupiedUnitsForTenant", () => {
  it("returns 0 for nullish input", () => {
    expect(countOccupiedUnitsForTenant(null)).toBe(0);
    expect(countOccupiedUnitsForTenant(undefined)).toBe(0);
  });

  it("returns 1 when leasedUnits is missing or empty", () => {
    expect(countOccupiedUnitsForTenant({})).toBe(1);
    expect(countOccupiedUnitsForTenant({ leasedUnits: [] })).toBe(1);
    expect(countOccupiedUnitsForTenant({ leasedUnits: "not-an-array" })).toBe(1);
  });

  it("returns leasedUnits length when present", () => {
    expect(countOccupiedUnitsForTenant({ leasedUnits: [{}] })).toBe(1);
    expect(countOccupiedUnitsForTenant({ leasedUnits: [{}, {}] })).toBe(2);
  });
});

describe("tenant financial and occupancy selection", () => {
  it("keeps financial-history selection independent of lease dates and tenant status", async () => {
    const propertyId = "64a000000000000000000021";
    const find = vi.fn((query: any) => {
      void query;
      return { toArray: async () => [] };
    });
    const db = { collection: () => ({ find }) };

    await fetchTenantsWithFinancialHistory(db as any, [propertyId]);

    const query = find.mock.calls[0][0] as any;
    expect(query.propertyId.$in.map(String)).toEqual(expect.arrayContaining([propertyId]));
    expect(query).not.toHaveProperty("leaseStartDate");
    expect(query).not.toHaveProperty("leaseEndDate");
    expect(query).not.toHaveProperty("status");
  });

  it("normalizes lease date formats and excludes invalid dates and non-occupying statuses", async () => {
    const aggregate = vi.fn((pipeline: any[]) => {
      void pipeline;
      return { toArray: async () => [] };
    });
    const db = { collection: () => ({ aggregate }) };
    await fetchTenantsActiveOnDay(db as any, ["64a000000000000000000021"], new Date("2026-11-03T12:00:00.000Z"));

    const stages = aggregate.mock.calls[0][0] as any[];
    expect(stages[0].$match.propertyId.$in.map(String)).toEqual(expect.arrayContaining(["64a000000000000000000021"]));
    expect(stages.some((stage) => stage.$addFields?._leaseStart?.$convert?.to === "date")).toBe(true);
    expect(stages.some((stage) => stage.$match?._statusLower?.$nin?.includes("moved out"))).toBe(true);
  });
});


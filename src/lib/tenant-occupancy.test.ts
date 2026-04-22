import { describe, expect, it } from "vitest";
import { countOccupiedUnitsForTenant } from "./tenant-occupancy";

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


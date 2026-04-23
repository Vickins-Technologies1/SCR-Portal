import { describe, expect, it } from "vitest";
import { filterOverridesForUnit } from "./rent-overrides";
import { resolveMonthlyRentForDate } from "./utils";

describe("rent price overrides", () => {
  describe("filterOverridesForUnit", () => {
    it("returns specific overrides when unitIdentifier matches", () => {
      const overrides = [
        { unitIdentifier: "1B-0", price: 20000, startDate: "2026-01-01", endDate: "2026-01-31" },
        { unitIdentifier: "Studio-0", price: 15000, startDate: "2026-01-01", endDate: "2026-01-31" },
      ] as any[];

      expect(filterOverridesForUnit(overrides as any, "Studio-0")).toHaveLength(1);
      expect(filterOverridesForUnit(overrides as any, "Studio-0")[0]?.price).toBe(15000);
    });

    it("falls back to generic overrides when no specific match exists", () => {
      const overrides = [
        { unitIdentifier: null, price: 21000, startDate: "2026-01-01", endDate: "2026-01-31" },
        { unitIdentifier: "1B-1", price: 22000, startDate: "2026-01-01", endDate: "2026-01-31" },
      ] as any[];

      const result = filterOverridesForUnit(overrides as any, "1B-0");
      expect(result).toHaveLength(1);
      expect(result[0]?.price).toBe(21000);
    });

    it("when unitIdentifier is missing, uses generic overrides if present", () => {
      const overrides = [
        { unitIdentifier: undefined, price: 30000, startDate: "2026-02-01", endDate: "2026-03-31" },
        { unitIdentifier: "1B-0", price: 35000, startDate: "2026-02-01", endDate: "2026-03-31" },
      ] as any[];

      const result = filterOverridesForUnit(overrides as any, undefined);
      expect(result).toHaveLength(1);
      expect(result[0]?.price).toBe(30000);
    });

    it("when unitIdentifier is missing and there is exactly one distinct unitIdentifier, returns those overrides", () => {
      const overrides = [
        { unitIdentifier: "1B-0", price: 40000, startDate: "2026-02-01", endDate: "2026-03-31" },
        { unitIdentifier: "1B-0", price: 45000, startDate: "2026-04-01", endDate: "2026-04-30" },
      ] as any[];

      const result = filterOverridesForUnit(overrides as any, undefined);
      expect(result).toHaveLength(2);
      expect(result.map((o) => o.price)).toEqual([40000, 45000]);
    });

    it("when unitIdentifier is missing and overrides span multiple unitIdentifiers, returns none", () => {
      const overrides = [
        { unitIdentifier: "1B-0", price: 40000, startDate: "2026-02-01", endDate: "2026-03-31" },
        { unitIdentifier: "1B-1", price: 45000, startDate: "2026-04-01", endDate: "2026-04-30" },
      ] as any[];

      const result = filterOverridesForUnit(overrides as any, undefined);
      expect(result).toHaveLength(0);
    });
  });

  describe("resolveMonthlyRentForDate", () => {
    it("uses base rent when no overrides match", () => {
      const rent = resolveMonthlyRentForDate({
        monthlyRent: 10000,
        date: new Date(2026, 2, 15), // Mar 15, 2026 (local)
        overrides: [{ price: 20000, startDate: "2026-04-01", endDate: "2026-04-30" }] as any,
      });

      expect(rent).toBe(10000);
    });

    it("applies override when date month is within override month range", () => {
      const rent = resolveMonthlyRentForDate({
        monthlyRent: 10000,
        date: new Date(2026, 3, 15), // Apr 15, 2026 (local)
        overrides: [{ price: 20000, startDate: "2026-04-01", endDate: "2026-06-30" }] as any,
      });

      expect(rent).toBe(20000);
    });

    it("prefers the most recent startDate when multiple overrides match (defensive)", () => {
      const rent = resolveMonthlyRentForDate({
        monthlyRent: 10000,
        date: new Date(2026, 3, 1), // Apr 2026
        overrides: [
          { price: 15000, startDate: "2026-01-01", endDate: "2026-12-31" },
          { price: 25000, startDate: "2026-04-01", endDate: "2026-04-30" },
        ] as any,
      });

      expect(rent).toBe(25000);
    });

    it("treats ISO timestamps as calendar dates (avoids timezone month-shift)", () => {
      const rent = resolveMonthlyRentForDate({
        monthlyRent: 10000,
        date: new Date(2026, 3, 2), // Apr 2026
        overrides: [
          {
            price: 22000,
            startDate: "2026-04-01T00:00:00.000Z",
            endDate: "2026-04-30T23:59:59.999Z",
          },
        ] as any,
      });

      expect(rent).toBe(22000);
    });
  });
});


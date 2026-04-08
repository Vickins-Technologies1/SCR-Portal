import { describe, expect, it } from "vitest";
import {
  calculateAdr,
  calculateOccupancyRate,
  calculateRevpar,
  formatKes,
} from "./airbnb-metrics";

describe("airbnb metrics", () => {
  it("calculates ADR safely", () => {
    expect(calculateAdr(120000, 40)).toBe(3000);
    expect(calculateAdr(0, 0)).toBe(0);
    expect(calculateAdr(120000, 0)).toBe(0);
  });

  it("calculates RevPAR safely", () => {
    expect(calculateRevpar(150000, 50)).toBe(3000);
    expect(calculateRevpar(0, 0)).toBe(0);
  });

  it("calculates occupancy within bounds", () => {
    expect(calculateOccupancyRate(15, 30)).toBe(50);
    expect(calculateOccupancyRate(0, 10)).toBe(0);
    expect(calculateOccupancyRate(12, 10)).toBe(100);
  });

  it("formats KES consistently", () => {
    expect(formatKes(12500)).toBe("Ksh 12,500");
    expect(formatKes(-40)).toBe("Ksh 0");
  });
});

import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDateKey, businessDateTime, businessDayEnd, businessDueDate, businessMonthKey, getBusinessDateParts } from "./business-time";

describe("Africa/Nairobi business time", () => {
  it("uses Nairobi calendar month around UTC month boundaries", () => {
    expect(businessMonthKey(new Date("2026-08-31T20:59:00.000Z"))).toBe("2026-08");
    expect(businessMonthKey(new Date("2026-08-31T21:00:00.000Z"))).toBe("2026-09");
    expect(businessMonthKey(new Date("2026-08-31T23:59:00.000Z"))).toBe("2026-09");
    expect(businessMonthKey(new Date("2026-12-31T21:00:00.000Z"))).toBe("2027-01");
  });

  it("clamps payment days to month length including leap years", () => {
    expect(businessDateKey(businessDueDate(2024, 1, 31))).toBe("2024-02-29");
    expect(businessDateKey(businessDueDate(2025, 1, 31))).toBe("2025-02-28");
    expect(businessDateKey(businessDueDate(2026, 3, 31))).toBe("2026-04-30");
  });

  it("handles business day boundaries and additions", () => {
    const instant = businessDateTime({ year: 2026, month: 12, day: 31 }, 23, 59, 59, 999);
    expect(getBusinessDateParts(instant)).toEqual({ year: 2026, month: 12, day: 31 });
    expect(businessDateKey(addBusinessDays(instant, 1))).toBe("2027-01-01");
    expect(businessDateKey(businessDayEnd(new Date("2026-12-31T20:59:59.999Z")))).toBe("2026-12-31");
  });
});

export const BUSINESS_TIME_ZONE = "Africa/Nairobi";

export interface BusinessDateParts {
  year: number;
  month: number;
  day: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getBusinessDateParts(value: Date): BusinessDateParts {
  const parts = formatter.formatToParts(value);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

// Short alias used by business-date consumers.
export const businessDateParts = getBusinessDateParts;

function timeZoneOffsetAt(instant: Date): number {
  const parts = formatter.formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function businessDateTime(parts: BusinessDateParts, hour = 0, minute = 0, second = 0, millisecond = 0): Date {
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond);
  let instant = new Date(wallClockAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = new Date(wallClockAsUtc - timeZoneOffsetAt(instant));
  }
  return instant;
}

export function businessDayStart(value: Date): Date {
  return businessDateTime(getBusinessDateParts(value));
}

export function businessDayEnd(value: Date): Date {
  return new Date(businessDateTime(getBusinessDateParts(value), 23, 59, 59, 999));
}

export function addBusinessDays(value: Date, days: number): Date {
  const parts = getBusinessDateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return businessDateTime({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

export function businessDateKey(value: Date): string {
  const { year, month, day } = getBusinessDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function businessMonthKey(value: Date): string {
  const { year, month } = getBusinessDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function businessMonthStart(year: number, monthIndex: number): Date {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return businessDateTime({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1 });
}

export function businessDueDate(year: number, monthIndex: number, paymentDay: number): Date {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, Math.trunc(paymentDay || 1)), daysInMonth);
  const date = new Date(Date.UTC(year, monthIndex, day));
  return businessDateTime({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

export function businessDateIsBefore(a: Date, b: Date): boolean {
  return businessDateKey(a) < businessDateKey(b);
}


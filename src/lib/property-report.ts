import { ObjectId } from "mongodb";
import { countOccupiedUnitsForTenant } from "@/lib/tenant-occupancy";

export interface PropertyPerformanceProperty {
  _id: string | ObjectId;
  name: string;
  createdAt?: Date | string | null;
  unitTypes?: Array<{
    quantity?: number | null;
  }>;
}

export interface PropertyPerformanceTenant {
  propertyId: string | ObjectId;
  leasedUnits?: unknown;
}

export interface PropertyPerformanceRow {
  propertyId: string;
  propertyName: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  vacancyRate: number;
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "neutral";
}

export interface PropertyPerformanceSummary {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  vacancyRate: number;
}

export interface PropertyPerformancePeriod {
  year: number;
  month: number;
  label: string;
  snapshotDate: string;
}

export interface PropertyPerformanceTrendSeries {
  labels: string[];
  occupancyRates: number[];
  vacancyRates: number[];
  occupiedUnits: number[];
  vacantUnits: number[];
  totalUnits: number[];
}

export interface PropertyPerformanceReport {
  period: PropertyPerformancePeriod;
  summary: PropertyPerformanceSummary;
  properties: PropertyPerformanceRow[];
  trend: PropertyPerformanceTrendSeries;
  availableYears: number[];
  basisNote: string;
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toId = (value: string | ObjectId): string => (typeof value === "string" ? value : value.toString());

export const getMonthEndSnapshot = (year: number, month: number): Date => {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
};

export const buildRollingPeriods = (year: number, month: number, count = 6): Array<PropertyPerformancePeriod & { snapshot: Date }> => {
  const selectedIndex = year * 12 + (month - 1);
  const periods: Array<PropertyPerformancePeriod & { snapshot: Date }> = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthIndex = selectedIndex - offset;
    const periodYear = Math.floor(monthIndex / 12);
    const periodMonth = (monthIndex % 12) + 1;
    const snapshot = getMonthEndSnapshot(periodYear, periodMonth);
    periods.push({
      year: periodYear,
      month: periodMonth,
      label: monthLabelFormatter.format(snapshot),
      snapshotDate: snapshot.toISOString(),
      snapshot,
    });
  }

  return periods;
};

export const filterPropertiesBySnapshot = (
  properties: PropertyPerformanceProperty[],
  snapshot: Date
): PropertyPerformanceProperty[] => {
  return properties.filter((property) => {
    const createdAt = toDate(property.createdAt);
    if (!createdAt) return true;
    return createdAt <= snapshot;
  });
};

export const groupOccupiedUnitsByProperty = (tenants: PropertyPerformanceTenant[]): Map<string, number> => {
  const occupiedByProperty = new Map<string, number>();

  for (const tenant of tenants) {
    const propertyId = toId(tenant.propertyId);
    const occupiedUnits = countOccupiedUnitsForTenant(tenant as any);
    occupiedByProperty.set(propertyId, (occupiedByProperty.get(propertyId) || 0) + occupiedUnits);
  }

  return occupiedByProperty;
};

const resolveStatusTone = (totalUnits: number, occupiedUnits: number): PropertyPerformanceRow["statusTone"] => {
  if (totalUnits <= 0) return "neutral";
  if (occupiedUnits === 0) return "danger";
  const occupancyRate = (occupiedUnits / totalUnits) * 100;
  if (occupancyRate >= 90) return "success";
  if (occupancyRate >= 60) return "warning";
  return "danger";
};

export const summarizePropertyPerformance = (
  properties: PropertyPerformanceProperty[],
  tenants: PropertyPerformanceTenant[]
): { summary: PropertyPerformanceSummary; properties: PropertyPerformanceRow[] } => {
  const occupiedByProperty = groupOccupiedUnitsByProperty(tenants);

  const rows: PropertyPerformanceRow[] = properties
    .map((property) => {
      const propertyId = toId(property._id);
      const totalUnits = (property.unitTypes || []).reduce(
        (sum, unit) => sum + Math.max(0, Number(unit.quantity ?? 0) || 0),
        0
      );
      const occupiedUnits = Math.max(0, occupiedByProperty.get(propertyId) || 0);
      const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
      const occupancyRate = totalUnits > 0 ? Number(((occupiedUnits / totalUnits) * 100).toFixed(1)) : 0;
      const vacancyRate = totalUnits > 0 ? Number(((vacantUnits / totalUnits) * 100).toFixed(1)) : 0;
      const statusTone = resolveStatusTone(totalUnits, occupiedUnits);

      return {
        propertyId,
        propertyName: property.name,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        occupancyRate,
        vacancyRate,
        statusLabel:
          totalUnits <= 0
            ? "No units"
            : occupiedUnits === 0
              ? "Vacant"
              : statusTone === "success"
                ? "Healthy"
                : statusTone === "warning"
                  ? "Stable"
                  : "Needs attention",
        statusTone,
      };
    })
    .sort((a, b) => {
      if (b.occupancyRate !== a.occupancyRate) return b.occupancyRate - a.occupancyRate;
      if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits;
      return a.propertyName.localeCompare(b.propertyName);
    });

  const summary = rows.reduce<PropertyPerformanceSummary>(
    (acc, row) => {
      acc.totalProperties += 1;
      acc.totalUnits += row.totalUnits;
      acc.occupiedUnits += row.occupiedUnits;
      acc.vacantUnits += row.vacantUnits;
      return acc;
    },
    { totalProperties: 0, totalUnits: 0, occupiedUnits: 0, vacantUnits: 0, occupancyRate: 0, vacancyRate: 0 }
  );

  summary.occupancyRate = summary.totalUnits > 0 ? Number(((summary.occupiedUnits / summary.totalUnits) * 100).toFixed(1)) : 0;
  summary.vacancyRate = summary.totalUnits > 0 ? Number(((summary.vacantUnits / summary.totalUnits) * 100).toFixed(1)) : 0;

  return { summary, properties: rows };
};

export const buildAvailableYears = (properties: PropertyPerformanceProperty[], fallbackYear: number): number[] => {
  const years = new Set<number>([fallbackYear]);

  for (const property of properties) {
    const createdAt = toDate(property.createdAt);
    if (!createdAt) continue;
    years.add(createdAt.getUTCFullYear());
  }

  return Array.from(years).sort((a, b) => b - a);
};

export const formatPeriodLabel = (year: number, month: number): string => {
  const snapshot = getMonthEndSnapshot(year, month);
  return monthFormatter.format(snapshot);
};

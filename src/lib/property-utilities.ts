import { Db, ObjectId } from "mongodb";
import { PropertyUtility } from "@/types/property";

export interface UtilityCharge {
  _id?: ObjectId;
  ownerId: string;
  propertyId: string;
  tenantId: string;
  utilityId: string;
  utilityName: string;
  billingPeriod: string;
  dueDate?: string;
  previousReading?: number;
  currentReading?: number;
  unitsUsed: number;
  ratePerUnit: number;
  amount: number;
  status: "posted" | "void";
  createdAt: string;
  updatedAt?: string;
}

export interface SanitizedUtilityInput {
  id?: string;
  name?: string;
  billingMode?: "fixed" | "metered";
  amount?: number | string | null;
  unitLabel?: string | null;
  startsAt?: string | null;
  active?: boolean;
}

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const parseDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toBillingPeriod = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const getUtilityDueDate = (billingPeriod: string, paymentDay = 1): Date | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(billingPeriod || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(1, Math.trunc(paymentDay || 1)), daysInMonth));
};

export const defaultUtilityStartDate = (date: Date = new Date()): string =>
  monthStart(date).toISOString();

export const countUtilityBillableMonths = ({
  leaseStartDate,
  utilityStartsAt,
  today = new Date(),
}: {
  leaseStartDate?: string | Date | null;
  utilityStartsAt?: string | Date | null;
  today?: Date;
}): number => {
  const leaseStart = parseDate(leaseStartDate);
  if (!leaseStart) return 0;

  const configuredStart = parseDate(utilityStartsAt);
  const start = monthStart(
    configuredStart && configuredStart > leaseStart ? configuredStart : leaseStart
  );
  const end = monthStart(today);
  if (end < start) return 0;

  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
};

export const getTenantUtilityUnitCount = (tenant: {
  leasedUnits?: unknown[];
  unitIdentifier?: string;
  unitType?: string;
  houseNumber?: string;
}): number => {
  if (Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length > 0) {
    return tenant.leasedUnits.length;
  }
  return tenant.unitIdentifier || tenant.unitType || tenant.houseNumber ? 1 : 0;
};

const cleanNumber = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

export const calculateMeteredUtilityAmount = (unitsUsed: number, ratePerUnit: number): number =>
  Math.round(Math.max(0, Number(unitsUsed) || 0) * Math.max(0, Number(ratePerUnit) || 0));

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export const sanitizePropertyUtilities = (
  input: unknown,
  now: Date = new Date()
): PropertyUtility[] => {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const utilities: PropertyUtility[] = [];

  input.forEach((raw, index) => {
    const item = raw as SanitizedUtilityInput;
    const name = String(item?.name || "").trim();
    if (!name) return;

    const billingMode = item.billingMode === "metered" ? "metered" : "fixed";
    const amount = Math.max(0, cleanNumber(item.amount));
    if (billingMode === "fixed" && amount <= 0) {
      throw new Error(`Utility '${name}' requires a fixed monthly amount greater than 0.`);
    }
    if (billingMode === "metered" && amount <= 0) {
      throw new Error(`Utility '${name}' requires a rate per unit greater than 0.`);
    }

    const baseId = String(item.id || `${slug(name) || "utility"}-${index}`).trim();
    let id = baseId || `utility-${index}`;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);

    const startsAtDate = parseDate(item.startsAt);
    utilities.push({
      id,
      name,
      billingMode,
      amount,
      unitLabel:
        billingMode === "metered"
          ? String(item.unitLabel || "unit").trim() || "unit"
          : undefined,
      startsAt: (startsAtDate ?? monthStart(now)).toISOString(),
      active: item.active !== false,
    });
  });

  return utilities;
};

export const calculateFixedUtilityDue = ({
  utilities,
  tenant,
  today = new Date(),
}: {
  utilities?: PropertyUtility[] | null;
  tenant: {
    leaseStartDate?: string | Date | null;
    leasedUnits?: unknown[];
    unitIdentifier?: string;
    unitType?: string;
    houseNumber?: string;
  };
  today?: Date;
}): number => {
  if (!Array.isArray(utilities) || utilities.length === 0) return 0;

  const unitCount = getTenantUtilityUnitCount(tenant);
  if (unitCount <= 0) return 0;

  return Math.round(
    utilities.reduce((sum, utility) => {
      if (!utility || utility.active === false || utility.billingMode !== "fixed") return sum;
      const months = countUtilityBillableMonths({
        leaseStartDate: tenant.leaseStartDate,
        utilityStartsAt: utility.startsAt,
        today,
      });
      return sum + Math.max(0, Number(utility.amount) || 0) * months * unitCount;
    }, 0)
  );
};

export type UtilityDueBreakdown = {
  charged: number;
  currentCharged: number;
  overdueCharged: number;
};

const emptyUtilityBreakdown = (): UtilityDueBreakdown => ({ charged: 0, currentCharged: 0, overdueCharged: 0 });

const addUtilityAmount = (breakdown: UtilityDueBreakdown, amount: number, dueDate: Date | null, today: Date) => {
  const safeAmount = Math.max(0, Math.round(amount || 0));
  if (!safeAmount) return;
  breakdown.charged += safeAmount;
  if (dueDate && dueDate.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
    breakdown.overdueCharged += safeAmount;
  } else {
    breakdown.currentCharged += safeAmount;
  }
};

export const calculateFixedUtilityBreakdown = ({
  utilities,
  tenant,
  today = new Date(),
  paymentDay = 1,
}: {
  utilities?: PropertyUtility[] | null;
  tenant: {
    leaseStartDate?: string | Date | null;
    leasedUnits?: unknown[];
    unitIdentifier?: string;
    unitType?: string;
    houseNumber?: string;
  };
  today?: Date;
  paymentDay?: number;
}): UtilityDueBreakdown => {
  const breakdown = emptyUtilityBreakdown();
  if (!Array.isArray(utilities)) return breakdown;
  const unitCount = getTenantUtilityUnitCount(tenant);
  if (unitCount <= 0) return breakdown;

  for (const utility of utilities) {
    if (!utility || utility.active === false || utility.billingMode !== "fixed") continue;
    const leaseStart = parseDate(tenant.leaseStartDate);
    if (!leaseStart) continue;
    const configuredStart = parseDate(utility.startsAt);
    const start = monthStart(configuredStart && configuredStart > leaseStart ? configuredStart : leaseStart);
    const end = monthStart(today);
    for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      addUtilityAmount(
        breakdown,
        Math.max(0, Number(utility.amount) || 0) * unitCount,
        getUtilityDueDate(toBillingPeriod(cursor), paymentDay),
        today
      );
    }
  }
  return breakdown;
};

export const getPostedMeteredUtilityTotal = async (
  db: Db,
  tenantId: string | ObjectId
): Promise<number> => {
  const tenantIdString = tenantId.toString();
  const rows = await db
    .collection("utilityCharges")
    .aggregate<{ total: number }>([
      { $match: { tenantId: tenantIdString, status: "posted" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();

  return Math.round(rows[0]?.total || 0);
};

export const getPostedMeteredUtilityBreakdown = async (
  db: Db,
  tenantId: string | ObjectId,
  today = new Date(),
  paymentDay = 1
): Promise<UtilityDueBreakdown> => {
  const rows = await db.collection<UtilityCharge>("utilityCharges")
    .find({ tenantId: tenantId.toString(), status: "posted" })
    .toArray();
  const breakdown = emptyUtilityBreakdown();
  const currentPeriod = toBillingPeriod(today);
  for (const charge of rows) {
    if (!charge.billingPeriod || charge.billingPeriod > currentPeriod) continue;
    addUtilityAmount(
      breakdown,
      Number(charge.amount) || 0,
      charge.dueDate ? parseDate(charge.dueDate) : getUtilityDueDate(charge.billingPeriod, paymentDay),
      today
    );
  }
  return breakdown;
};

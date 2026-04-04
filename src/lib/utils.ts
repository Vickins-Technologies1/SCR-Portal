// src/lib/utils.ts
import { UnitType } from '../types/property';
import { Tenant, ResponseTenant } from '../types/tenant';
import { RentPriceOverride } from '../types/rent-price-override';
import { Db, ObjectId } from 'mongodb';

interface LogMeta {
  [key: string]: unknown;
}

const logger = {
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${message}`, meta || '');
    return { message, meta, level: 'warn' };
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || '');
    return { message, meta, level: 'error' };
  },
};

export const toISOStringSafe = (value: Date | undefined, field: string): string => {
  if (!value) {
    logger.warn(`Empty value for ${field}, returning empty string`, { value, field });
    return '';
  }
  try {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString();
    }
    logger.warn(`Invalid Date object for ${field}, returning empty string`, { value, field });
    return '';
  } catch (error) {
    logger.error(`Error converting ${field} to ISO string`, {
      value,
      field,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return '';
  }
};

export const normalizeUnitTypes = (unitTypes: UnitType[]): UnitType[] => {
  return unitTypes.map((unit, index) => ({
    type: unit.type,
    uniqueType: unit.uniqueType || `${unit.type}-${index}`,
    price: unit.price,
    deposit: unit.deposit,
    managementType: unit.managementType || 'RentCollection',
    quantity: unit.quantity,
    managementFee: unit.managementFee || 0,
  }));
};

export interface TenantDues {
  rentDues: number;
  penaltyDues?: number;
  depositDues: number;
  utilityDues: number;
  totalRemainingDues: number;
  paymentStatus: 'overdue' | 'up-to-date';
  monthsStayed: number;
  walletApplied?: number;
  walletRemaining?: number;
  walletCoverageMonths?: number;
  walletCoverageRemainder?: number;
}

export interface WalletAutoApplyResult {
  walletAppliedNow: number;
  walletAppliedAlready: number;
  walletRemaining: number;
  rentPaidTotal: number;
  walletCoverageMonths: number;
  walletCoverageRemainder: number;
}

export interface RentDueResult {
  rentDue: number;
  monthsStayed: number;
  daysInMonth: number;
  daysElapsedInMonth: number;
  dailyRent: number;
}

const roundCurrency = (value: number): number => Math.round(value);
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toValidDate = (value?: Date | string): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toMonthStart = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getDueDateForMonth = (year: number, month: number, paymentDay: number): Date => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, paymentDay), daysInMonth);
  return new Date(year, month, day);
};

const getMostRecentDueDate = (today: Date, paymentDay: number): Date => {
  const currentMonthDue = getDueDateForMonth(today.getFullYear(), today.getMonth(), paymentDay);
  if (startOfDay(today) >= startOfDay(currentMonthDue)) {
    return currentMonthDue;
  }
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return getDueDateForMonth(prevMonth.getFullYear(), prevMonth.getMonth(), paymentDay);
};

const getNextDueDate = (today: Date, paymentDay: number): Date => {
  const currentMonthDue = getDueDateForMonth(today.getFullYear(), today.getMonth(), paymentDay);
  if (startOfDay(today) > startOfDay(currentMonthDue)) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return getDueDateForMonth(nextMonth.getFullYear(), nextMonth.getMonth(), paymentDay);
  }
  return currentMonthDue;
};

export const calculateOverduePenalty = ({
  rentDues,
  today,
  rentPaymentDate,
  leaseStartDate,
  penaltyAmount,
  penaltyFrequency,
}: {
  rentDues: number;
  today: Date;
  rentPaymentDate?: number;
  leaseStartDate?: string;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
}): number => {
  if (!rentPaymentDate || !penaltyAmount || penaltyAmount <= 0) return 0;
  if (!penaltyFrequency) return 0;
  if (rentDues <= 0) return 0;

  const todayStart = startOfDay(today);
  let dueDate = getMostRecentDueDate(todayStart, rentPaymentDate);

  const leaseStart = toValidDate(leaseStartDate);
  if (leaseStart) {
    const firstDueDate = getNextDueDate(startOfDay(leaseStart), rentPaymentDate);
    if (todayStart < startOfDay(firstDueDate)) {
      return 0;
    }
    if (dueDate < firstDueDate) {
      dueDate = firstDueDate;
    }
  }

  const daysOverdue = Math.floor(
    (todayStart.getTime() - startOfDay(dueDate).getTime()) / MS_PER_DAY
  );
  if (daysOverdue <= 0) return 0;

  const periodsOverdue =
    penaltyFrequency === "weekly" ? Math.floor(daysOverdue / 7) : daysOverdue;

  if (periodsOverdue <= 0) return 0;

  return roundCurrency(periodsOverdue * penaltyAmount);
};

const normalizeOverrides = (overrides?: RentPriceOverride[]): RentPriceOverride[] => {
  if (!overrides?.length) return [];
  return overrides.filter((override) => override && override.status !== "inactive");
};

export const resolveMonthlyRentForDate = ({
  monthlyRent,
  date,
  overrides,
}: {
  monthlyRent: number;
  date: Date;
  overrides?: RentPriceOverride[];
}): number => {
  const baseRent = Math.max(0, monthlyRent || 0);
  const activeOverrides = normalizeOverrides(overrides);
  if (!activeOverrides.length) return baseRent;

  const monthStart = toMonthStart(date);
  let matched: RentPriceOverride | null = null;

  for (const override of activeOverrides) {
    const start = toValidDate(override.startDate);
    const end = toValidDate(override.endDate);
    if (!start || !end) continue;
    const startMonth = toMonthStart(start);
    const endMonth = toMonthStart(end);

    if (monthStart < startMonth || monthStart > endMonth) continue;

    if (!matched) {
      matched = override;
      continue;
    }

    const matchedStart = toValidDate(matched.startDate);
    if (matchedStart && start > matchedStart) {
      matched = override;
    }
  }

  if (!matched) return baseRent;
  return Math.max(0, matched.price || 0);
};

export const calculateWalletBalanceFromPayments = ({
  rentPaid = 0,
  depositPaid = 0,
  utilityPaid = 0,
  rentDue = 0,
  depositDue = 0,
  utilityDue = 0,
}: {
  rentPaid?: number;
  depositPaid?: number;
  utilityPaid?: number;
  rentDue?: number;
  depositDue?: number;
  utilityDue?: number;
}): number => {
  const rentOver = Math.max(0, rentPaid - rentDue);
  const depositOver = Math.max(0, depositPaid - depositDue);
  const utilityOver = Math.max(0, utilityPaid - utilityDue);
  return roundCurrency(rentOver + depositOver + utilityOver);
};

export const calculateRentDueToDate = ({
  leaseStartDate,
  monthlyRent,
  today = new Date(),
  overrides,
}: {
  leaseStartDate?: string;
  monthlyRent: number;
  today?: Date;
  overrides?: RentPriceOverride[];
}): RentDueResult => {
  const safeMonthlyRent = Math.max(0, monthlyRent || 0);
  const hasOverrides = normalizeOverrides(overrides).length > 0;
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentMonthlyRent = resolveMonthlyRentForDate({
    monthlyRent: safeMonthlyRent,
    date: today,
    overrides,
  });
  const currentDailyRent = currentMonthlyRent > 0 ? currentMonthlyRent / daysInCurrentMonth : 0;

  if (!leaseStartDate || (!hasOverrides && safeMonthlyRent <= 0)) {
    return {
      rentDue: 0,
      monthsStayed: 0,
      daysInMonth: daysInCurrentMonth,
      daysElapsedInMonth: 0,
      dailyRent: currentDailyRent,
    };
  }

  const start = new Date(leaseStartDate);
  if (Number.isNaN(start.getTime()) || today < start) {
    return {
      rentDue: 0,
      monthsStayed: 0,
      daysInMonth: daysInCurrentMonth,
      daysElapsedInMonth: 0,
      dailyRent: currentDailyRent,
    };
  }

  const startMonthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const monthDiff =
    (currentMonthStart.getFullYear() - startMonthStart.getFullYear()) * 12 +
    (currentMonthStart.getMonth() - startMonthStart.getMonth());

  const monthsStayed = Math.max(1, monthDiff + 1);

  let rentDueTotal = 0;
  for (let i = 0; i < monthsStayed; i += 1) {
    const monthStart = new Date(startMonthStart.getFullYear(), startMonthStart.getMonth() + i, 1);
    const effectiveMonthlyRent = resolveMonthlyRentForDate({
      monthlyRent: safeMonthlyRent,
      date: monthStart,
      overrides,
    });
    rentDueTotal += effectiveMonthlyRent;
  }

  const rentDue = roundCurrency(rentDueTotal);

  return {
    rentDue,
    monthsStayed,
    daysInMonth: daysInCurrentMonth,
    daysElapsedInMonth: Math.min(daysInCurrentMonth, today.getDate()),
    dailyRent: currentDailyRent,
  };
};

export const applyWalletToRent = ({
  rentDue,
  rentPaidFromPayments,
  rentPaidRecorded,
  walletBalance,
  monthlyRent,
}: {
  rentDue: number;
  rentPaidFromPayments: number;
  rentPaidRecorded: number;
  walletBalance: number;
  monthlyRent: number;
}): WalletAutoApplyResult => {
  const safeMonthlyRent = Math.max(0, monthlyRent || 0);
  const safeRentDue = Math.max(0, rentDue || 0);
  const safeWallet = Math.max(0, walletBalance || 0);
  const paidFromPayments = Math.max(0, rentPaidFromPayments || 0);
  const recordedPaid = Math.max(0, rentPaidRecorded || 0);

  const paidFromPaymentsCapped = Math.min(paidFromPayments, safeRentDue);
  const recordedPaidCapped = Math.min(recordedPaid, safeRentDue);
  const basePaid = Math.min(safeRentDue, Math.max(recordedPaidCapped, paidFromPaymentsCapped));

  const overRecorded = Math.max(0, recordedPaid - safeRentDue);
  const walletAvailable = safeWallet + overRecorded;

  const outstandingRent = Math.max(0, safeRentDue - basePaid);
  const walletAppliedNow = Math.min(walletAvailable, outstandingRent);
  const walletRemaining = Math.max(0, walletAvailable - walletAppliedNow);
  const walletAppliedAlready = Math.max(0, basePaid - paidFromPaymentsCapped);
  const rentPaidTotal = Math.min(safeRentDue, basePaid + walletAppliedNow);

  const walletCoverageMonths = safeMonthlyRent > 0 ? Math.floor(walletRemaining / safeMonthlyRent) : 0;
  const walletCoverageRemainder =
    safeMonthlyRent > 0 ? walletRemaining - walletCoverageMonths * safeMonthlyRent : walletRemaining;

  return {
    walletAppliedNow: roundCurrency(walletAppliedNow),
    walletAppliedAlready: roundCurrency(walletAppliedAlready),
    walletRemaining: roundCurrency(walletRemaining),
    rentPaidTotal: roundCurrency(rentPaidTotal),
    walletCoverageMonths,
    walletCoverageRemainder: roundCurrency(walletCoverageRemainder),
  };
};
export const calculateTenantDues = async (
  db: Db,
  tenant: Tenant,
  today: Date = new Date(),
  rentOverrides?: RentPriceOverride[],
  penaltyConfig?: {
    penaltyAmount?: number;
    penaltyFrequency?: "daily" | "weekly";
    rentPaymentDate?: number;
  }
): Promise<TenantDues> => {
  const { rentDue: totalRentDue, monthsStayed } = calculateRentDueToDate({
    leaseStartDate: tenant.leaseStartDate,
    monthlyRent: tenant.price,
    today,
    overrides: rentOverrides,
  });
  const currentMonthlyRent = resolveMonthlyRentForDate({
    monthlyRent: tenant.price,
    date: today,
    overrides: rentOverrides,
  });
  const totalDepositDue = tenant.deposit || 0;
  const totalUtilityDue = 0;

  const walletBalance = tenant.walletBalance || 0;
  const rentPaid = tenant.totalRentPaid || 0;
  const depositPaid = tenant.totalDepositPaid || 0;
  const utilityPaid = tenant.totalUtilityPaid || 0;

  const walletApplied = 0;
  const walletRemaining = roundCurrency(walletBalance);

  const baseRentDues = roundCurrency(Math.max(0, totalRentDue - rentPaid));
  const penaltyDues = calculateOverduePenalty({
    rentDues: baseRentDues,
    today,
    rentPaymentDate: penaltyConfig?.rentPaymentDate,
    leaseStartDate: tenant.leaseStartDate,
    penaltyAmount: penaltyConfig?.penaltyAmount,
    penaltyFrequency: penaltyConfig?.penaltyFrequency,
  });
  const rentDues = roundCurrency(baseRentDues + penaltyDues);
  const depositDues = roundCurrency(Math.max(0, totalDepositDue - depositPaid));
  const utilityDues = roundCurrency(Math.max(0, totalUtilityDue - utilityPaid));
  const totalRemainingDues = roundCurrency(Math.max(0, rentDues + depositDues + utilityDues));
  const paymentStatus = totalRemainingDues > 0 ? 'overdue' : 'up-to-date';

  return {
    rentDues,
    penaltyDues,
    depositDues,
    utilityDues,
    totalRemainingDues,
    paymentStatus,
    monthsStayed,
    walletApplied,
    walletRemaining,
    walletCoverageMonths: currentMonthlyRent > 0 ? Math.floor(walletRemaining / currentMonthlyRent) : 0,
    walletCoverageRemainder: roundCurrency(
      currentMonthlyRent > 0 ? walletRemaining % currentMonthlyRent : walletRemaining
    ),
  };
};

// FIXED: Now handles unitIdentifier properly
export const convertTenantToResponse = (tenant: Tenant & { unitIdentifier?: string }): ResponseTenant => ({
  _id: tenant._id.toString(),
  ownerId: tenant.ownerId,
  name: tenant.name,
  email: tenant.email,
  phone: tenant.phone,
  role: "tenant" as const,
  propertyId: tenant.propertyId,
  unitType: tenant.unitType,
  unitIdentifier: tenant.unitIdentifier || "", // ← REQUIRED FIELD, safe fallback
  price: tenant.price,
  deposit: tenant.deposit,
  houseNumber: tenant.houseNumber,
  leaseStartDate: tenant.leaseStartDate,
  leaseEndDate: tenant.leaseEndDate,
  status: tenant.status || "active",
  paymentStatus: tenant.paymentStatus || "current",
  createdAt: toISOStringSafe(tenant.createdAt, 'tenant.createdAt'),
  updatedAt: toISOStringSafe(tenant.updatedAt, 'tenant.updatedAt'),
  totalRentPaid: tenant.totalRentPaid ?? 0,
  totalUtilityPaid: tenant.totalUtilityPaid ?? 0,
  totalDepositPaid: tenant.totalDepositPaid ?? 0,
  walletBalance: tenant.walletBalance ?? 0,
  deliveryMethod: tenant.deliveryMethod || "both",
});

/**
 * Merges class names conditionally (like clsx + tailwind-merge)
 * Usage: cn("px-4", isActive && "bg-blue-500", "text-sm")
 */
export function cn(...inputs: (string | undefined | null | false | 0 | "")[]): string {
  return inputs
    .filter(Boolean)                    // remove falsy values
    .join(" ")
    .trim();
}


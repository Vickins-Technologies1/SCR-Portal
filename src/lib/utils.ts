// src/lib/utils.ts
import { UnitType } from '../types/property';
import { Tenant, ResponseTenant, TenantLeaseUnit } from '../types/tenant';
import { RentPriceOverride } from '../types/rent-price-override';
import { Db, ObjectId } from 'mongodb';
import { buildOverrideKey, filterOverridesForUnit } from './rent-overrides';

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

export const resolveTenantRequiredDeposit = ({
  tenant,
  unitTypes,
}: {
  tenant: Pick<Tenant, 'deposit' | 'unitIdentifier' | 'unitType' | 'leasedUnits'>;
  unitTypes?: UnitType[] | null;
}): number => {
  const safeNumber = (value: unknown): number => Math.max(0, Number(value) || 0);

  const normalizedUnitTypes = Array.isArray(unitTypes) ? normalizeUnitTypes(unitTypes) : null;
  const unitTypeByUniqueId = normalizedUnitTypes
    ? new Map<string, UnitType>(
        normalizedUnitTypes
          .filter((unit) => typeof unit.uniqueType === 'string' && unit.uniqueType.length > 0)
          .map((unit) => [unit.uniqueType as string, unit])
      )
    : null;
  const unitTypesByType = normalizedUnitTypes
    ? normalizedUnitTypes.reduce((map, unit) => {
        const key = unit.type;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(unit);
        return map;
      }, new Map<string, UnitType[]>())
    : null;

  const resolveDepositForUnit = ({
    unitIdentifier,
    unitType,
    fallbackDeposit,
  }: {
    unitIdentifier?: string;
    unitType?: string;
    fallbackDeposit?: number;
  }): number => {
    if (unitTypeByUniqueId && unitIdentifier) {
      const match = unitTypeByUniqueId.get(unitIdentifier);
      if (match) return safeNumber(match.deposit);
    }

    if (unitTypesByType && unitType) {
      const candidates = unitTypesByType.get(unitType);
      if (candidates && candidates.length > 0) {
        return safeNumber(candidates[0]?.deposit);
      }
    }

    return safeNumber(fallbackDeposit);
  };

  if (Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length > 0) {
    return roundCurrency(
      tenant.leasedUnits.reduce((sum, unit) => {
        return (
          sum +
          resolveDepositForUnit({
            unitIdentifier: unit?.unitIdentifier,
            unitType: unit?.unitType,
            fallbackDeposit: unit?.deposit,
          })
        );
      }, 0)
    );
  }

  const resolvedSingleDeposit = resolveDepositForUnit({
    unitIdentifier: tenant.unitIdentifier,
    unitType: tenant.unitType,
    fallbackDeposit: tenant.deposit,
  });

  return roundCurrency(resolvedSingleDeposit);
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

export interface TenantRentContext {
  totalMonthlyRent: number;
  totalDeposit: number;
  leaseUnits: TenantLeaseUnit[];
}

const roundCurrency = (value: number): number => Math.round(value);
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const parseLocalDateLikeString = (value: string): Date | null => {
  const trimmed = value.trim();
  // Accept date-only strings and ISO timestamps; interpret as a calendar date in local time.
  // This avoids the UTC-shift issue of `new Date('YYYY-MM-DD')` in non-UTC time zones.
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toValidDate = (value?: Date | string): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsedLocal = parseLocalDateLikeString(value);
  const date = parsedLocal ?? new Date(value);
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

const getTenantLeaseUnits = (tenant: {
  leasedUnits?: TenantLeaseUnit[];
  unitIdentifier?: string;
  unitType?: string;
  houseNumber?: string;
  price?: number;
  deposit?: number;
}): TenantLeaseUnit[] => {
  if (tenant.leasedUnits && tenant.leasedUnits.length > 0) {
    const normalized = tenant.leasedUnits.map((unit) => ({
      unitIdentifier: unit.unitIdentifier,
      unitType: unit.unitType,
      houseNumber: unit.houseNumber,
      price: unit.price ?? 0,
      deposit: unit.deposit ?? 0,
    }));

    const totalUnitPrice = normalized.reduce((sum, unit) => sum + (unit.price || 0), 0);
    const totalUnitDeposit = normalized.reduce((sum, unit) => sum + (unit.deposit || 0), 0);
    const tenantPrice = tenant.price ?? 0;
    const tenantDeposit = tenant.deposit ?? 0;

    const missingPriceIndexes = tenant.leasedUnits
      .map((unit, index) => {
        const candidate = unit.price == null || (normalized[index].price <= 0 && tenantPrice > totalUnitPrice);
        return candidate ? index : -1;
      })
      .filter((index) => index >= 0);
    const missingDepositIndexes = tenant.leasedUnits
      .map((unit, index) => {
        const candidate = unit.deposit == null || (normalized[index].deposit <= 0 && tenantDeposit > totalUnitDeposit);
        return candidate ? index : -1;
      })
      .filter((index) => index >= 0);

    if (missingPriceIndexes.length > 0 && tenantPrice > totalUnitPrice) {
      const remaining = tenantPrice - totalUnitPrice;
      const perUnit = remaining / missingPriceIndexes.length;
      for (const index of missingPriceIndexes) {
        normalized[index].price = perUnit;
      }
    }

    if (missingDepositIndexes.length > 0 && tenantDeposit > totalUnitDeposit) {
      const remaining = tenantDeposit - totalUnitDeposit;
      const perUnit = remaining / missingDepositIndexes.length;
      for (const index of missingDepositIndexes) {
        normalized[index].deposit = perUnit;
      }
    }

    return normalized;
  }

  if (!tenant.unitIdentifier && !tenant.unitType && !tenant.houseNumber) {
    return [];
  }

  return [
    {
      unitIdentifier: tenant.unitIdentifier || '',
      unitType: tenant.unitType || '',
      houseNumber: tenant.houseNumber || '',
      price: tenant.price || 0,
      deposit: tenant.deposit || 0,
    },
  ];
};

const resolveMonthlyRentForLeaseUnit = ({
  unit,
  date,
  rentOverrideMap,
  propertyId,
}: {
  unit: TenantLeaseUnit;
  date: Date;
  rentOverrideMap?: Map<string, RentPriceOverride[]>;
  propertyId?: string;
}): number => {
  const baseRent = Math.max(0, unit.price || 0);
  if (!rentOverrideMap || !propertyId || !unit.unitType) {
    return resolveMonthlyRentForDate({ monthlyRent: baseRent, date, overrides: [] });
  }

  const overrides = filterOverridesForUnit(
    rentOverrideMap.get(buildOverrideKey(propertyId, unit.unitType)) ?? [],
    unit.unitIdentifier
  );

  return resolveMonthlyRentForDate({
    monthlyRent: baseRent,
    date,
    overrides,
  });
};

export const resolveTenantMonthlyRentForDate = ({
  tenant,
  date,
  rentOverrideMap,
}: {
  tenant: Tenant;
  date: Date;
  rentOverrideMap?: Map<string, RentPriceOverride[]>;
}): number => {
  const leaseUnits = getTenantLeaseUnits(tenant);
  if (!leaseUnits.length) return 0;
  return leaseUnits.reduce(
    (sum, unit) =>
      sum + resolveMonthlyRentForLeaseUnit({ unit, date, rentOverrideMap, propertyId: tenant.propertyId }),
    0
  );
};

export const getTenantRentContext = ({
  tenant,
  date,
  rentOverrideMap,
}: {
  tenant: Tenant;
  date: Date;
  rentOverrideMap?: Map<string, RentPriceOverride[]>;
}): TenantRentContext => {
  const leaseUnits = getTenantLeaseUnits(tenant);
  const totalMonthlyRent = leaseUnits.reduce(
    (sum, unit) =>
      sum + resolveMonthlyRentForLeaseUnit({ unit, date, rentOverrideMap, propertyId: tenant.propertyId }),
    0
  );
  const totalDeposit = leaseUnits.reduce((sum, unit) => sum + (unit.deposit || 0), 0);
  return {
    totalMonthlyRent: roundCurrency(totalMonthlyRent),
    totalDeposit: roundCurrency(totalDeposit),
    leaseUnits,
  };
};

export const calculateTenantRentDueToDate = ({
  tenant,
  today = new Date(),
  rentOverrideMap,
}: {
  tenant: Tenant;
  today?: Date;
  rentOverrideMap?: Map<string, RentPriceOverride[]>;
}): RentDueResult => {
  const leaseUnits = getTenantLeaseUnits(tenant);
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  if (!tenant.leaseStartDate || leaseUnits.length === 0) {
    return {
      rentDue: 0,
      monthsStayed: 0,
      daysInMonth: daysInCurrentMonth,
      daysElapsedInMonth: 0,
      dailyRent: 0,
    };
  }

  const start = new Date(tenant.leaseStartDate);
  if (Number.isNaN(start.getTime()) || today < start) {
    return {
      rentDue: 0,
      monthsStayed: 0,
      daysInMonth: daysInCurrentMonth,
      daysElapsedInMonth: 0,
      dailyRent: 0,
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
    const monthRent = leaseUnits.reduce(
      (sum, unit) =>
        sum + resolveMonthlyRentForLeaseUnit({ unit, date: monthStart, rentOverrideMap, propertyId: tenant.propertyId }),
      0
    );
    rentDueTotal += monthRent;
  }

  const currentMonthlyRent = leaseUnits.reduce(
    (sum, unit) =>
      sum + resolveMonthlyRentForLeaseUnit({ unit, date: today, rentOverrideMap, propertyId: tenant.propertyId }),
    0
  );

  return {
    rentDue: roundCurrency(rentDueTotal),
    monthsStayed,
    daysInMonth: daysInCurrentMonth,
    daysElapsedInMonth: Math.min(daysInCurrentMonth, today.getDate()),
    dailyRent: currentMonthlyRent > 0 ? currentMonthlyRent / daysInCurrentMonth : 0,
  };
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
  rentOverridesOrMap?: RentPriceOverride[] | Map<string, RentPriceOverride[]>,
  penaltyConfig?: {
    penaltyAmount?: number;
    penaltyFrequency?: "daily" | "weekly";
    rentPaymentDate?: number;
    propertyUnitTypes?: UnitType[];
  }
): Promise<TenantDues> => {
  const fetchPropertyUnitTypes = async (): Promise<UnitType[] | null> => {
    if (Array.isArray(penaltyConfig?.propertyUnitTypes)) return penaltyConfig?.propertyUnitTypes ?? null;
    if (!tenant.propertyId) return null;

    const queryByObjectId = async (id: string) => {
      if (!ObjectId.isValid(id)) return null;
      return db.collection<{ _id: ObjectId; unitTypes?: UnitType[] }>('properties').findOne(
        { _id: new ObjectId(id) },
        { projection: { unitTypes: 1 } }
      );
    };

    const queryByString = async (id: string) => {
      return db.collection<{ _id: string; unitTypes?: UnitType[] }>('properties').findOne(
        { _id: id },
        { projection: { unitTypes: 1 } }
      );
    };

    const propertyByObjectId = await queryByObjectId(tenant.propertyId);
    if (propertyByObjectId?.unitTypes) return propertyByObjectId.unitTypes;

    const propertyByString = await queryByString(tenant.propertyId);
    if (propertyByString?.unitTypes) return propertyByString.unitTypes;

    return null;
  };

  const rentOverrideMap = rentOverridesOrMap instanceof Map ? rentOverridesOrMap : undefined;
  const rentOverrides = Array.isArray(rentOverridesOrMap) ? rentOverridesOrMap : undefined;
  const rentDueResult = tenant.leasedUnits && tenant.leasedUnits.length > 0
    ? calculateTenantRentDueToDate({ tenant, today, rentOverrideMap })
    : calculateRentDueToDate({
        leaseStartDate: tenant.leaseStartDate,
        monthlyRent: tenant.price,
        today,
        overrides: rentOverrides,
      });
  const { rentDue: totalRentDue, monthsStayed } = rentDueResult;

  const currentMonthlyRent = tenant.leasedUnits && tenant.leasedUnits.length > 0
    ? resolveTenantMonthlyRentForDate({ tenant, date: today, rentOverrideMap })
    : resolveMonthlyRentForDate({
        monthlyRent: tenant.price,
        date: today,
        overrides: rentOverrides,
      });

  const propertyUnitTypes = await fetchPropertyUnitTypes();
  const totalDepositDue = resolveTenantRequiredDeposit({ tenant, unitTypes: propertyUnitTypes });
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
  leasedUnits: tenant.leasedUnits,
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


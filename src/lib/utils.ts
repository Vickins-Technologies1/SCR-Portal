import { UnitType } from '../types/property';
import { Tenant, ResponseTenant } from '../types/tenant';
import { Db } from 'mongodb';

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
  depositDues: number;
  utilityDues: number;
  totalRemainingDues: number;
  paymentStatus: 'overdue' | 'up-to-date';
  monthsStayed: number;
}

export const calculateTenantDues = async (db: Db, tenant: Tenant, today: Date = new Date()): Promise<TenantDues> => {
  let monthsStayed = 0;
  if (tenant.leaseStartDate) {
    const result = await db
      .collection('tenants')
      .aggregate([
        {
          $match: { _id: tenant._id },
        },
        {
          $project: {
            monthsStayed: {
              $add: [
                {
                  $dateDiff: {
                    startDate: { $toDate: '$leaseStartDate' },
                    endDate: today,
                    unit: 'month',
                  },
                },
                {
                  $cond: {
                    if: {
                      $lte: [{ $toDate: '$leaseStartDate' }, today],
                    },
                    then: 1, // Include the current month
                    else: 0,
                  },
                },
              ],
            },
          },
        },
      ])
      .toArray();
    monthsStayed = result[0]?.monthsStayed || 0;
  }

  const totalRentDue = tenant.leaseStartDate && tenant.price ? tenant.price * monthsStayed : 0;
  const totalDepositDue = tenant.deposit || 0;
  const totalUtilityDue = 0; // Utility dues not tracked
  const totalPaid = (tenant.totalRentPaid || 0) + (tenant.totalUtilityPaid || 0) + (tenant.totalDepositPaid || 0);
  const totalRemainingDues = Math.max(0, totalRentDue + totalDepositDue + totalUtilityDue - totalPaid);
  const paymentStatus = totalRemainingDues > 0 ? 'overdue' : 'up-to-date';

  return {
    rentDues: Math.max(0, totalRentDue - (tenant.totalRentPaid || 0)),
    depositDues: Math.max(0, totalDepositDue - (tenant.totalDepositPaid || 0)),
    utilityDues: totalUtilityDue,
    totalRemainingDues,
    paymentStatus,
    monthsStayed,
  };
};

export const convertTenantToResponse = (tenant: Tenant): ResponseTenant => ({
  _id: tenant._id.toString(),
  ownerId: tenant.ownerId,
  name: tenant.name,
  email: tenant.email,
  phone: tenant.phone,
  role: tenant.role,
  propertyId: tenant.propertyId,
  unitType: tenant.unitType,
  price: tenant.price,
  deposit: tenant.deposit,
  houseNumber: tenant.houseNumber,
  leaseStartDate: tenant.leaseStartDate,
  leaseEndDate: tenant.leaseEndDate,
  status: tenant.status,
  paymentStatus: tenant.paymentStatus,
  createdAt: toISOStringSafe(tenant.createdAt, 'tenant.createdAt'),
  updatedAt: toISOStringSafe(tenant.updatedAt, 'tenant.updatedAt'),
  totalRentPaid: tenant.totalRentPaid,
  totalUtilityPaid: tenant.totalUtilityPaid,
  totalDepositPaid: tenant.totalDepositPaid,
  walletBalance: tenant.walletBalance,
  deliveryMethod: tenant.deliveryMethod,
});
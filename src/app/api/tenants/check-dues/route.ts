// src/app/api/tenants/check-dues/route.ts

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { resolveTenantMonthlyRentForDate } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { countOccupiedUnitsForTenant, fetchTenantsActiveOnDay } from "@/lib/tenant-occupancy";
import {
  calculateTenantFinancialState,
  reconcileTenantPaymentAllocation,
  type TenantFinancialState,
} from "@/lib/tenant-payment-allocation";
import { getFinancialReportSummary } from "@/lib/financial-reporting";

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  unitIdentifier?: string;
  leasedUnits?: Array<{
    unitIdentifier: string;
    unitType: string;
    houseNumber: string;
    price: number;
    deposit: number;
  }>;
  houseNumber: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus?: string;
  walletBalance: number;
  totalRentPaid?: number;
  totalDepositPaid?: number;
  totalUtilityPaid?: number;
}

interface Stats {
  activeProperties: number;
  totalTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  totalMonthlyRent: number;
  overduePayments: number;
  totalPayments: number;
  totalOverdueAmount: number;
}

async function calculateTenantDues(db: Db, tenantId: string, today = new Date()) {
  const todayISO = today.toISOString();
  const tenant = await db
    .collection<Tenant>("tenants")
    .findOne({ _id: new ObjectId(tenantId) });

  if (!tenant) return null;

  const allocation = await reconcileTenantPaymentAllocation(db, tenantId);
  if (!allocation) return null;

  const rentPaid = allocation.rentPaid;
  const depositPaid = allocation.depositPaid;
  const utilityPaid = allocation.utilityPaid;
  const otherPaid = allocation.otherPaid;
  const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [tenant.propertyId]);
  const monthsStayed = allocation.monthsStayed;
  const rentDue = allocation.rentDue;
  const updatedTotalRentPaid = allocation.rentPaid;
  const totalDeposit = allocation.depositDue;
  const updatedWalletBalance = allocation.walletBalance;
  const baseRentDues = allocation.rentOutstanding;
  const penaltyDues = allocation.penalties;
  const rentDues = Math.max(0, baseRentDues + penaltyDues);
  const depositDues = allocation.depositOutstanding;
  const utilityDues = allocation.utilitiesOutstanding;
  const totalRemainingDues = allocation.totalOutstanding;
  const paymentStatus = allocation.overdueAmount > 0 ? "overdue" : "up-to-date";

  await db.collection<Tenant>("tenants").updateOne(
    { _id: new ObjectId(tenantId) },
    {
      $set: {
        totalRentPaid: updatedTotalRentPaid,
        totalDepositPaid: depositPaid,
        totalUtilityPaid: utilityPaid,
        totalOtherPaid: otherPaid,
        walletBalance: updatedWalletBalance,
        paymentStatus,
        updatedAt: todayISO,
      },
    }
  );

  const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
    tenant: tenant as any,
    date: today,
    rentOverrideMap,
  });

  const dues = {
    rentDues,
    rentOutstanding: baseRentDues,
    penaltyDues,
    depositDues,
    utilityDues,
    utilityCurrentDues: allocation.utilitiesCurrentOutstanding,
    utilityOverdueDues: allocation.utilitiesOverdueOutstanding,
    utilityStatus: allocation.utilityStatus,
    otherDues: allocation.otherOutstanding,
    totalRemainingDues,
    totalPaid: rentPaid + utilityPaid + depositPaid + otherPaid + updatedWalletBalance,
    walletApplied: allocation.walletApplied,
    walletRemaining: updatedWalletBalance,
    walletCoverageMonths: effectiveMonthlyRent ? Math.floor(updatedWalletBalance / effectiveMonthlyRent) : 0,
    walletCoverageRemainder: effectiveMonthlyRent ? updatedWalletBalance % effectiveMonthlyRent : updatedWalletBalance,
  };

  logger.info("Tenant dues recalculated and totals synced", {
    tenantId,
    monthsStayed,
    rentDue,
    depositDue: totalDeposit,
    rentPaid,
    depositPaid,
    totalRemainingDues,
  });

  return {
    tenant: {
      ...tenant,
      _id: tenant._id.toString(),
      totalRentPaid: updatedTotalRentPaid,
      totalDepositPaid: depositPaid,
      totalUtilityPaid: utilityPaid,
      totalOtherPaid: otherPaid,
      walletBalance: updatedWalletBalance,
      paymentStatus,
      updatedAt: todayISO,
    },
    dues,
    monthsStayed,
  };
}

function buildTenantDuesResponse(
  tenant: Tenant,
  state: TenantFinancialState,
  today: Date,
  rentOverrideMap: Map<string, any>
) {
  const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
    tenant: tenant as any,
    date: today,
    rentOverrideMap,
  });
  const totalRemainingDues = state.totalOutstanding;
  const paymentStatus = state.overdueAmount > 0 ? "overdue" : "up-to-date";

  return {
    tenant: {
      ...tenant,
      _id: tenant._id.toString(),
      totalRentPaid: state.rentPaid,
      totalDepositPaid: state.depositPaid,
      totalUtilityPaid: state.utilitiesPaid,
      totalOtherPaid: state.otherPaid,
      walletBalance: state.walletBalance,
      paymentStatus,
      updatedAt: today.toISOString(),
    },
    dues: {
      rentDues: Math.max(0, state.rentOutstanding + state.penalties),
      rentOutstanding: state.rentOutstanding,
      penaltyDues: state.penalties,
      depositDues: state.depositOutstanding,
      utilityDues: state.utilitiesOutstanding,
      utilityCurrentDues: state.utilitiesCurrentOutstanding,
      utilityOverdueDues: state.utilitiesOverdueOutstanding,
      utilityStatus: state.utilityStatus,
      otherDues: 0,
      totalRemainingDues,
      totalPaid: state.rentPaid + state.utilitiesPaid + state.depositPaid + state.otherPaid + state.walletBalance,
      walletApplied: state.walletApplied,
      walletRemaining: state.walletBalance,
      walletCoverageMonths: effectiveMonthlyRent ? Math.floor(state.walletBalance / effectiveMonthlyRent) : 0,
      walletCoverageRemainder: effectiveMonthlyRent
        ? state.walletBalance % effectiveMonthlyRent
        : state.walletBalance,
    },
    monthsStayed: state.monthsStayed,
  };
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function calculateBatchTenantDues(db: Db, tenantIds: string[]) {
  const today = new Date();
  const tenantObjectIds = tenantIds.map((id) => new ObjectId(id));
  const tenants = await db
    .collection<Tenant>("tenants")
    .find({ _id: { $in: tenantObjectIds } })
    .toArray();
  const tenantById = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]));

  const allPropertyIds = Array.from(
    new Set(
      tenants
        .map((tenant) => String(tenant.propertyId || ""))
        .filter(Boolean)
    )
  );
  const propertyIds = allPropertyIds.filter((propertyId) => ObjectId.isValid(propertyId));
  const propertyObjectIds = propertyIds.map((propertyId) => new ObjectId(propertyId));
  const [properties, rentOverrideMap] = await Promise.all([
    propertyObjectIds.length > 0
      ? db.collection("properties").find({ _id: { $in: propertyObjectIds } }).toArray()
      : Promise.resolve([]),
    fetchActiveRentOverridesByPropertyIds(db, allPropertyIds),
  ]);
  const propertyById = new Map(properties.map((property) => [property._id.toString(), property]));

  return mapWithConcurrency(tenantIds, 8, async (tenantId) => {
    const tenant = tenantById.get(tenantId);
    if (!tenant) return { tenantId };

    try {
      const state = await calculateTenantFinancialState(db, tenant, {
        property: propertyById.get(String(tenant.propertyId)),
        asOf: today,
        rentOverrideMap,
      });
      return { tenantId, ...buildTenantDuesResponse(tenant, state, today, rentOverrideMap) };
    } catch (error) {
      logger.error("Error checking tenant dues", { error, tenantId });
      return { tenantId };
    }
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId || !ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Valid userId is required" }, { status: 400 });
  }

  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    return buildInvalidCsrfResponse(request);
  }

  try {
    const { db } = await connectToDatabase();
    const today = new Date();
    const todayISO = today.toISOString();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const properties = await db.collection("properties").find({ ownerId: userId }).toArray();
    const propertyIds = properties.map((p: any) => p._id.toString());
    const propertyMap = new Map(properties.map((p: any) => [p._id.toString(), p]));

    if (propertyIds.length === 0) {
      const emptyStats: Stats = {
        activeProperties: 0,
        totalTenants: 0,
        totalUnits: 0,
        occupiedUnits: 0,
        totalMonthlyRent: 0,
        overduePayments: 0,
        totalPayments: 0,
        totalOverdueAmount: 0,
      };
      return NextResponse.json({ success: true, stats: emptyStats });
    }

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);

    // 1. Total Units
    const totalUnitsResult = await db.collection("properties")
      .aggregate([
        { $match: { ownerId: userId } },
        { $unwind: "$unitTypes" },
        { $group: { _id: null, totalUnits: { $sum: "$unitTypes.quantity" } } },
      ])
      .toArray();
    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    // 2. Active Tenants + Occupied Units (DB-filtered, supports string/Date lease fields and multi-unit tenants)
    const activeTenants = await fetchTenantsActiveOnDay<Tenant>(db, propertyIds, today);
    const totalTenants = activeTenants.length;
    const occupiedUnits = activeTenants.reduce((sum, tenant) => sum + countOccupiedUnitsForTenant(tenant), 0);

    // 3-4. Revenue uses the same net, reversal-aware financial projection as reports.
    const [monthlySummary, lifetimeSummary] = await Promise.all([
      getFinancialReportSummary({ db, propertyIds, start: startOfMonth, end: endOfMonth }),
      getFinancialReportSummary({ db, propertyIds }),
    ]);
    const totalMonthlyRent = monthlySummary.netReceived;
    const totalPayments = lifetimeSummary.netReceived;

    // 5. Overdue Calculation
    let overdueCount = 0;
    let totalOverdueAmount = 0;

    const states = await Promise.all(activeTenants.map(async (tenant) => ({
      tenant,
      state: await calculateTenantFinancialState(db, tenant, {
        property: propertyMap.get(tenant.propertyId),
        asOf: today,
        rentOverrideMap,
      }),
    })));

    const bulkUpdates = states.map(({ tenant, state }) => {
      const totalDue = state.overdueAmount;
      if (totalDue > 0) {
        overdueCount++;
        totalOverdueAmount += totalDue;
      }
      return {
        updateOne: {
          filter: { _id: tenant._id },
          update: { $set: { paymentStatus: totalDue > 0 ? "overdue" : "up-to-date", updatedAt: todayISO } },
        },
      };
    });

    if (bulkUpdates.length > 0) {
      await db.collection("tenants").bulkWrite(bulkUpdates);
    }

    const stats: Stats = {
      activeProperties: propertyIds.length,
      totalTenants,
      totalUnits,
      occupiedUnits,
      totalMonthlyRent,
      overduePayments: overdueCount,
      totalPayments,
      totalOverdueAmount,
    };

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    logger.error("Error in owner stats", { error });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const tenantIds = Array.isArray(body.tenantIds) ? body.tenantIds : null;
  const tenantId = body.tenantId;

  if (tenantIds) {
    if (
      tenantIds.length === 0 ||
      tenantIds.length > 100 ||
      tenantIds.some((id: unknown) => typeof id !== "string" || !ObjectId.isValid(id))
    ) {
      return NextResponse.json(
        { success: false, message: "Valid tenantIds are required" },
        { status: 400 }
      );
    }
  } else if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json(
      { success: false, message: "Valid tenantId is required" },
      { status: 400 }
    );
  }

  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    return buildInvalidCsrfResponse(request);
  }

  try {
    const { db } = await connectToDatabase();

    if (tenantIds) {
      const results = await calculateBatchTenantDues(db, tenantIds);
      return NextResponse.json({ success: true, results });
    }

    const result = await calculateTenantDues(db, tenantId);
    if (!result) {
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error("Error checking tenant dues", { error, tenantId });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

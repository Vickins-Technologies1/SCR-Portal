// src/app/api/tenant/dues/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { WithId, ObjectId } from "mongodb";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateTenantFinancialState, sumTenantOverdueAmount } from "@/lib/tenant-payment-allocation";
import { getFinancialPaymentRows, summarizeFinancialPaymentRows } from "@/lib/financial-reporting";
import { identityValues } from "@/lib/payment-query";
import { buildPropertyIdCandidates, countOccupiedUnitsForTenant, fetchTenantsActiveOnDay } from "@/lib/tenant-occupancy";
import { businessDateParts, businessMonthStart } from "@/lib/business-time";
import { calculateTenantFinancialViews } from "@/lib/tenant-financial-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Property {
  _id: ObjectId;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
  status: string;
  ownerId: string;
  createdAt: string;
  rentPaymentDate?: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
  utilities?: any[];
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

interface DuePayload {
  tenantId: string;
  userId: string;
}

interface Tenant {
  _id: string;
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
  price: number;
  deposit: number;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  totalRentPaid?: number;
  totalUtilityPaid?: number;
  totalDepositPaid?: number;
  paymentStatus: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    logger.error("Missing userId in ownerstats request");
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(userId)) {
    logger.error("Invalid userId format", { userId });
    return NextResponse.json({ success: false, message: "Invalid userId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    logger.error("Invalid CSRF token in ownerstats request", { userId });
    return buildInvalidCsrfResponse(request);
  }

  try {
    const { db } = await connectToDatabase();

    const propertyFilter: Record<string, unknown> = {
      ownerId: { $in: identityValues(userId) },
    };

    // Keep financial history for all owned properties; occupancy and unit
    // capacity remain scoped to active properties.
    const properties = await db
      .collection("properties")
      .find<WithId<Property>>(propertyFilter)
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());
    const activeProperties = properties.filter((property) =>
      property.status == null || ["Active", "active"].includes(String(property.status))
    );
    const activePropertyIds = activeProperties.map((property) => property._id.toString());
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    if (properties.length === 0) {
      logger.debug("No properties found for user", { userId });
      const stats: Stats = {
        activeProperties: 0,
        totalTenants: 0,
        totalUnits: 0,
        occupiedUnits: 0,
        totalMonthlyRent: 0,
        overduePayments: 0,
        totalPayments: 0,
        totalOverdueAmount: 0,
      };
      return NextResponse.json({ success: true, stats }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    logger.debug("Properties fetched for ownerstats", { userId, propertyIds });

    const today = new Date();
    const { year, month } = businessDateParts(today);
    const startOfMonth = businessMonthStart(year, month - 1);

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);

    // Total units aggregation
    const totalUnitsResult = await db
      .collection("properties")
      .aggregate<{ totalUnits: number }>([
        { $match: {
          ...propertyFilter,
          $or: [{ status: { $in: ["Active", "active"] } }, { status: { $exists: false } }],
        } },
        { $unwind: "$unitTypes" },
        { $group: { _id: null, totalUnits: { $sum: "$unitTypes.quantity" } } },
      ])
      .toArray();
    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    const [allTenants, activeTenants] = await Promise.all([
      db.collection("tenants").find({ propertyId: { $in: buildPropertyIdCandidates(propertyIds) } }).toArray(),
      fetchTenantsActiveOnDay<Tenant>(db, activePropertyIds, today),
    ]);
    const totalTenants = allTenants.length;
    const occupiedUnits = activeTenants.reduce((sum, tenant) => sum + countOccupiedUnitsForTenant(tenant), 0);
    const tenantIds = allTenants.map((tenant: any) => tenant._id);

    logger.debug("Tenants fetched for ownerstats", { userId, tenantIds, totalTenants, occupiedUnits });

    const [monthlyRows, lifetimeRows] = await Promise.all([
      getFinancialPaymentRows({ db, propertyIds, tenantIdsForUnresolvedProperty: tenantIds, start: startOfMonth, end: today }),
      getFinancialPaymentRows({ db, propertyIds, tenantIdsForUnresolvedProperty: tenantIds, end: today }),
    ]);
    const totalMonthlyRent = summarizeFinancialPaymentRows(monthlyRows).rentReceived;
    const totalPayments = summarizeFinancialPaymentRows(lifetimeRows).netReceived;

    let overduePayments = 0;
    const allTenantStates = await Promise.all(allTenants.map(async (tenant) => ({
      tenant,
      state: await calculateTenantFinancialState(db, tenant, { property: propertyMap.get(String(tenant.propertyId)), asOf: today, rentOverrideMap }),
    })));
    const activeTenantIds = new Set(activeTenants.map((tenant) => String(tenant._id)));
    const activeStates = allTenantStates.filter(({ tenant }) => activeTenantIds.has(String(tenant._id)));
    activeStates.forEach(({ state }) => {
      if (state.overdueAmount > 0) overduePayments += 1;
    });
    const totalOverdueAmount = sumTenantOverdueAmount(allTenantStates.map(({ state }) => state));

    const stats: Stats = {
      activeProperties: activeProperties.length,
      totalTenants,
      totalUnits,
      occupiedUnits,
      totalMonthlyRent,
      overduePayments,
      totalPayments,
      totalOverdueAmount,
    };

    logger.debug("Successfully fetched owner stats", { userId, stats });
    return NextResponse.json({ success: true, stats }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    logger.error("Error fetching owner stats", {
      userId,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    logger.error("Invalid CSRF token in tenant dues request");
    return buildInvalidCsrfResponse(request);
  }

  try {
    const body: DuePayload = await request.json();
    const { tenantId, userId } = body;

    // Validate input
    if (!tenantId || !userId) {
      logger.error("Missing tenantId or userId in tenant dues request", { tenantId, userId });
      return NextResponse.json({ success: false, message: "tenantId and userId are required" }, { status: 400 });
    }

    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId)) {
      logger.error("Invalid tenantId or userId format", { tenantId, userId });
      return NextResponse.json({ success: false, message: "Invalid tenantId or userId format" }, { status: 400 });
    }

    // Ensure tenantId matches userId (tenant is the user)
    if (tenantId !== userId) {
      logger.error("tenantId does not match userId", { tenantId, userId });
      return NextResponse.json({ success: false, message: "Unauthorized: tenantId must match userId" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    // Verify tenant exists
    const tenant = await db.collection("tenants").findOne<WithId<Tenant>>({
      _id: new ObjectId(tenantId),
    });

    if (!tenant) {
      logger.error("Tenant not found", { tenantId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const today = new Date();
    const [view] = await calculateTenantFinancialViews(db, [tenant], today);
    if (!view) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }
    const dues = { ...view.dues, paymentStatus: view.tenant.paymentStatus, monthsStayed: view.monthsStayed };

    logger.debug("Successfully calculated tenant dues", {
      tenantId,
      userId,
      dues,
      monthsStayed: dues.monthsStayed,
    });
    return NextResponse.json({ success: true, dues, monthsStayed: dues.monthsStayed }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    logger.error("Error processing tenant dues", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

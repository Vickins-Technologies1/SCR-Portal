// src/app/api/tenants/check-dues/route.ts

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { buildPropertyIdCandidates, countOccupiedUnitsForTenant, fetchTenantsActiveOnDay } from "@/lib/tenant-occupancy";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { getFinancialReportSummary } from "@/lib/financial-reporting";
import { identityValues } from "@/lib/payment-query";
import { calculateTenantFinancialViews } from "@/lib/tenant-financial-view";
import { summarizeTenantFinancialStates } from "@/lib/tenant-financial-view";
import { businessDateParts, businessMonthStart } from "@/lib/business-time";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

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

interface OwnerScope {
  ownerId: string;
  assignedPropertyIds: string[] | null;
}

async function resolveOwnerScope(request: NextRequest, db: Db): Promise<OwnerScope | null> {
  const sessionUserId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!sessionUserId || !ObjectId.isValid(sessionUserId)) return null;

  if (role === "propertyOwner") return { ownerId: sessionUserId, assignedPropertyIds: null };
  if (role !== "teamMember") return null;

  const teamMember = await db.collection("teamMembers").findOne({
    _id: new ObjectId(sessionUserId),
    active: true,
  });
  if (!teamMember?.ownerId || !ObjectId.isValid(String(teamMember.ownerId))) return null;

  const assignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
    ? Array.from(new Set<string>((teamMember as any).assignedPropertyIds
        .map((value: unknown): string => String(value || "").trim())
        .filter((value: string): value is string => ObjectId.isValid(value))))
    : null;

  return {
    ownerId: String(teamMember.ownerId),
    assignedPropertyIds: assignedPropertyIds?.length ? assignedPropertyIds : null,
  };
}

async function tenantIdsBelongToOwner(db: Db, tenantIds: string[], scope: OwnerScope): Promise<boolean> {
  const uniqueTenantIds = Array.from(new Set(tenantIds));
  const tenantObjectIds = uniqueTenantIds.map((id) => new ObjectId(id));
  const tenants = await db.collection("tenants").find({
    _id: { $in: tenantObjectIds },
    ownerId: { $in: identityValues(scope.ownerId) },
  }).toArray();
  if (tenants.length !== uniqueTenantIds.length) return false;

  const propertyIds = Array.from(new Set<string>(tenants
    .map((tenant: any): string => String(tenant.propertyId || ""))
    .filter((propertyId: string): propertyId is string => ObjectId.isValid(propertyId))));
  if (!propertyIds.length) return false;
  const properties = await db.collection("properties").find({
    _id: { $in: identityValues(propertyIds) },
    ownerId: { $in: identityValues(scope.ownerId) },
  } as any).project({ _id: 1 }).toArray();
  const ownerPropertyIds = new Set(properties.map((property: any) => String(property._id)));

  return tenants.every((tenant: any) => {
    const propertyId = String(tenant.propertyId || "");
    return ownerPropertyIds.has(propertyId) &&
      (!scope.assignedPropertyIds || scope.assignedPropertyIds.includes(propertyId));
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
    const scope = await resolveOwnerScope(request, db);
    if (!scope) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (userId !== scope.ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const today = new Date();
    const todayParts = businessDateParts(today);
    const startOfMonth = businessMonthStart(todayParts.year, todayParts.month - 1);

    const propertyFilter: Record<string, unknown> = {
      ownerId: { $in: identityValues(scope.ownerId) },
    };
    if (scope.assignedPropertyIds) {
      propertyFilter._id = { $in: identityValues(scope.assignedPropertyIds) };
    }
    const properties = await db.collection("properties").find(propertyFilter).toArray();
    const propertyIds = properties.map((p: any) => p._id.toString());
    const activeProperties = properties.filter((property: any) =>
      property.status == null || ["Active", "active"].includes(String(property.status))
    );
    const activePropertyIds = activeProperties.map((property: any) => property._id.toString());
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
      return NextResponse.json({ success: true, stats: emptyStats }, { headers: NO_STORE_HEADERS });
    }

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);

    // 1. Total Units
    const totalUnitsResult = await db.collection("properties")
      .aggregate([
        { $match: {
          ...propertyFilter,
          $or: [{ status: { $in: ["Active", "active"] } }, { status: { $exists: false } }],
        } },
        { $unwind: "$unitTypes" },
        { $group: { _id: null, totalUnits: { $sum: "$unitTypes.quantity" } } },
      ])
      .toArray();
    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    // 2. Active Tenants + Occupied Units (DB-filtered, supports string/Date lease fields and multi-unit tenants)
    const activeTenants = await fetchTenantsActiveOnDay<Tenant>(db, activePropertyIds, today);
    const allTenants = await db.collection<Tenant>("tenants").find({
      propertyId: { $in: buildPropertyIdCandidates(propertyIds) },
    } as any).toArray();
    const totalTenants = allTenants.length;
    const occupiedUnits = activeTenants.reduce((sum, tenant) => sum + countOccupiedUnitsForTenant(tenant), 0);

    // 3-4. Revenue uses the same net, reversal-aware financial projection as reports.
    const [monthlySummary, lifetimeSummary] = await Promise.all([
      getFinancialReportSummary({ db, propertyIds, start: startOfMonth, end: today }),
      getFinancialReportSummary({ db, propertyIds, end: today }),
    ]);
    const totalMonthlyRent = monthlySummary.rentReceived;
    const totalPayments = lifetimeSummary.netReceived;

    // 5. Overdue Calculation
    const activeTenantIds = new Set(activeTenants.map((tenant) => String(tenant._id)));
    const states = await Promise.all(allTenants.map(async (tenant) => ({
      tenant,
      state: await calculateTenantFinancialState(db, tenant, {
        property: propertyMap.get(tenant.propertyId),
        asOf: today,
        rentOverrideMap,
      }),
    })));

    const overduePayments = states.filter(({ tenant, state }) =>
      activeTenantIds.has(String(tenant._id)) && state.overdueAmount > 0
    ).length;
    const ledgerSummary = summarizeTenantFinancialStates(states.map(({ state }) => state));

    const stats: Stats = {
      activeProperties: activeProperties.length,
      totalTenants,
      totalUnits,
      occupiedUnits,
      totalMonthlyRent,
      overduePayments,
      totalPayments,
      totalOverdueAmount: ledgerSummary.overdueRent + ledgerSummary.overdueUtilities,
    };

    return NextResponse.json({ success: true, stats }, { headers: NO_STORE_HEADERS });
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
    const scope = await resolveOwnerScope(request, db);
    if (!scope) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (body.userId !== scope.ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const requestedTenantIds = tenantIds || [tenantId];
    if (!(await tenantIdsBelongToOwner(db, requestedTenantIds, scope))) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const tenantDocs = await db.collection<Tenant>("tenants").find({
      _id: { $in: requestedTenantIds.map((id: string) => new ObjectId(id)) },
      ownerId: { $in: identityValues(scope.ownerId) },
    } as any).toArray();
    const views = await calculateTenantFinancialViews(db, tenantDocs);
    const results = views.map((view) => ({
      tenantId: String(view.tenant._id),
      tenant: view.tenant,
      dues: view.dues,
      monthsStayed: view.monthsStayed,
    }));

    if (tenantIds) {
      return NextResponse.json({ success: true, results }, { headers: NO_STORE_HEADERS });
    }

    const result = results[0];
    if (!result) {
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, ...result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error("Error checking tenant dues", { error, tenantId });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

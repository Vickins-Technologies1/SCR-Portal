import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { WithId, ObjectId } from "mongodb";
import { resolveTenantMonthlyRentForDate } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateTenantFinancialState, sumTenantDepositPaid, sumTenantOverdueAmount, tenantOverdueStatus } from "@/lib/tenant-payment-allocation";
import { countOccupiedUnitsForTenant, fetchTenantsActiveOnDay, fetchTenantsOverlappingRange } from "@/lib/tenant-occupancy";
import { getFinancialPaymentRows, summarizeFinancialPaymentRows } from "@/lib/financial-reporting";
import { businessMonthStart } from "@/lib/business-time";

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
  status: string;
  ownerId: string;
  createdAt: string;
  rentPaymentDate?: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
}

interface TenantDoc {
  _id: ObjectId;
  propertyId: string;
  leasedUnits?: Array<{
    unitIdentifier?: string;
    unitType?: string;
    houseNumber?: string;
    price?: number;
    deposit?: number;
  }>;
  unitIdentifier?: string;
  unitType?: string;
  houseNumber?: string;
  price?: number;
  deposit?: number;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  status?: string;
}

interface Stats {
  activeProperties: number;
  totalTenants: number;
  activeTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  expectedMonthlyRent: number;
  totalMonthlyRent: number;
  totalRentPaid: number;
  totalDepositDue: number;
  overduePayments: number;
  totalPayments: number;
  totalOverdueAmount: number;
  totalPenaltyAmount: number;
  totalDepositPaid: number;
  totalUtilityPaid: number;
}

const roundMoney = (value: number) => Math.round(value || 0);
const ACTIVE_PROPERTY_STATUSES = ["Active", "active"] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("userId");
  const requestedPropertyId = searchParams.get("propertyId");

  if (!requestedOwnerId) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(requestedOwnerId)) {
    return NextResponse.json({ success: false, message: "Invalid userId format" }, { status: 400 });
  }

  if (requestedPropertyId && !ObjectId.isValid(requestedPropertyId)) {
    return NextResponse.json({ success: false, message: "Invalid propertyId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return buildInvalidCsrfResponse(request);
  }

  const {cookies} = request;
  const role = cookies.get("role")?.value;
  const loggedInUserId = cookies.get("userId")?.value;

  let authorized = false;
  const effectiveOwnerId = requestedOwnerId;
  let teamMemberAssignedPropertyIds: string[] | null = null;

  if (role === "propertyOwner") {
    if (loggedInUserId === requestedOwnerId) {
      authorized = true;
    }
  } else if (role === "teamMember") {
    if (!loggedInUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const teamMember = await db.collection("teamMembers").findOne({
      _id: new ObjectId(loggedInUserId),
      ownerId: new ObjectId(requestedOwnerId),
      active: true,
    });

    if (teamMember) {
      authorized = true;
      teamMemberAssignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
        ? Array.from(
            new Set(
              (teamMember as any).assignedPropertyIds
                .map((value: any) => String(value || "").trim())
                .filter((value: string) => ObjectId.isValid(value))
            )
          )
        : null;
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, message: "Unauthorized: You do not have access to this owner's data" },
      { status: 403 }
    );
  }

  try {
    const { db } = await connectToDatabase();

    if (
      role === "teamMember" &&
      requestedPropertyId &&
      teamMemberAssignedPropertyIds &&
      teamMemberAssignedPropertyIds.length > 0 &&
      !teamMemberAssignedPropertyIds.includes(requestedPropertyId)
    ) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: You do not have access to this property" },
        { status: 403 }
      );
    }

    const allowedPropertyIds =
      requestedPropertyId
        ? [requestedPropertyId]
        : role === "teamMember" && teamMemberAssignedPropertyIds && teamMemberAssignedPropertyIds.length > 0
          ? teamMemberAssignedPropertyIds
          : null;

    const propertyFilter: Record<string, unknown> = {
      ownerId: effectiveOwnerId,
      $or: [
        { status: { $in: ACTIVE_PROPERTY_STATUSES } },
        { status: { $exists: false } },
      ],
    };

    if (allowedPropertyIds) {
      propertyFilter._id = { $in: allowedPropertyIds.map((id) => new ObjectId(id)) };
    }

    // Fetch active properties for the owner
    const properties = await db
      .collection("properties")
      .find<WithId<Property>>(propertyFilter)
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    if (properties.length === 0) {
      const stats: Stats = {
        activeProperties: 0,
        totalTenants: 0,
        activeTenants: 0,
        totalUnits: 0,
        occupiedUnits: 0,
        expectedMonthlyRent: 0,
        totalMonthlyRent: 0,
        totalRentPaid: 0,
        totalDepositDue: 0,
        overduePayments: 0,
        totalPayments: 0,
        totalOverdueAmount: 0,
        totalPenaltyAmount: 0,
        totalDepositPaid: 0,
        totalUtilityPaid: 0,
      };
      return NextResponse.json({ success: true, stats });
    }

    const today = new Date();
    const todayISO = today.toISOString();
    const nairobiParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "numeric",
    }).formatToParts(today);
    const currentYear = Number(nairobiParts.find((part) => part.type === "year")?.value);
    const currentMonth = Number(nairobiParts.find((part) => part.type === "month")?.value) - 1;
    const startOfMonth = businessMonthStart(currentYear, currentMonth);
    const endOfMonth = new Date(businessMonthStart(currentYear, currentMonth + 1).getTime() - 1);

    const tenantCollection = db.collection<TenantDoc>("tenants");
    // These reads are independent after the property list is known. Keep the
    // individual queries and result handling unchanged while overlapping their
    // network/database wait time.
    const [
      totalUnitsResult,
      rentOverrideMap,
      totalTenants,
      tenantsForFinancials,
      activeTenantsForOccupancy,
      activeTenantsForMonth,
    ] = await Promise.all([
      db
        .collection("properties")
        .aggregate<{ totalUnits: number }>([
          { $match: propertyFilter },
          { $unwind: "$unitTypes" },
          {
            $group: {
              _id: null,
              totalUnits: { $sum: "$unitTypes.quantity" },
            },
          },
        ])
        .toArray(),
      fetchActiveRentOverridesByPropertyIds(db, propertyIds),
      tenantCollection.countDocuments({ propertyId: { $in: propertyIds } }),
      tenantCollection.find({ propertyId: { $in: propertyIds } }).toArray(),
      fetchTenantsActiveOnDay<TenantDoc>(db, propertyIds, today),
      fetchTenantsOverlappingRange<TenantDoc>(db, propertyIds, startOfMonth, endOfMonth),
    ]);

    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    const activeTenants = activeTenantsForOccupancy.length;
    const occupiedUnits = activeTenantsForOccupancy.reduce(
      (sum, tenant) => sum + countOccupiedUnitsForTenant(tenant),
      0
    );

    const [monthlyRows, lifetimeRows] = await Promise.all([
      getFinancialPaymentRows({
        db,
        propertyIds,
        tenantIdsForLegacyPropertyless: tenantsForFinancials.map((tenant: any) => tenant._id),
        start: startOfMonth,
        end: today,
      }),
      getFinancialPaymentRows({
        db,
        propertyIds,
        tenantIdsForLegacyPropertyless: tenantsForFinancials.map((tenant: any) => tenant._id),
        end: today,
      }),
    ]);

    // Historical receipt categories use posted snapshots; current tenant
    // states are independently recalculated for outstanding balances.
    const allTenantStates = await Promise.all(tenantsForFinancials.map(async (tenant: any) => ({
      tenant,
      state: await calculateTenantFinancialState(db, tenant, { property: propertyMap.get(String(tenant.propertyId)), asOf: today }),
    })));
    const monthlySummary = summarizeFinancialPaymentRows(monthlyRows);
    const lifetimeSummary = summarizeFinancialPaymentRows(lifetimeRows);
    const rentCollectedThisMonth = roundMoney(monthlySummary.rentReceived);

    const totalMonthlyRent = rentCollectedThisMonth;

    // Total rent paid (all time)
    const totalRentPaid = roundMoney(lifetimeSummary.rentReceived);
    const totalPayments = roundMoney(lifetimeSummary.netReceived);
    const totalUtilityPaid = roundMoney(lifetimeSummary.utilityReceived);

    // === Overdue Logic ===
    const activeTenantsForDues = activeTenantsForOccupancy;

    let overduePayments = 0;
    let totalPenaltyAmount = 0;
    let totalDepositDue = 0;

    const activeTenantIds = new Set(activeTenantsForDues.map((tenant) => String(tenant._id)));
    const tenantStates = allTenantStates.filter(({ tenant }) => activeTenantIds.has(String(tenant._id)));
    const bulkOps = tenantStates.map(({ tenant, state }) => {
      totalPenaltyAmount += state.penalties;
      totalDepositDue += state.depositOutstanding;
      const roundedOverdue = state.overdueAmount;

      if (roundedOverdue > 0) {
        overduePayments += 1;
      }

      return {
        updateOne: {
          filter: { _id: tenant._id },
          update: {
            $set: {
              // Keep the persisted tenant status aligned with the full
              // financial state. The overdue metric intentionally excludes
              // deposits/penalties, but a tenant with any outstanding
              // obligation is not up to date.
              paymentStatus: tenantOverdueStatus(state),
              updatedAt: todayISO,
            },
          },
        },
      };
    });

    // Deposits must come from the same tenant ledger used for dues. Summing
    // raw payments with type "Deposit" incorrectly counts overpayments and
    // ignores payments whose allocation was split across charges.
    // Deposits remain held after tenancy ends, so the collected metric includes
    // every tenant ledger attached to an active owner property.
    const totalDepositPaid = roundMoney(sumTenantDepositPaid(allTenantStates.map(({ state }) => state)));
    const totalOverdueFromComponents = roundMoney(sumTenantOverdueAmount(tenantStates.map(({ state }) => state)));

    if (bulkOps.length > 0) {
      await tenantCollection.bulkWrite(bulkOps);
    }

    const expectedMonthlyRent = roundMoney(
      activeTenantsForMonth.reduce((sum, tenant: any) => {
        const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
          tenant,
          date: startOfMonth,
          rentOverrideMap,
        });
        return sum + effectiveMonthlyRent;
      }, 0)
    );

    // Final stats
    const stats: Stats = {
      activeProperties: properties.length,
      totalTenants,
      activeTenants,
      totalUnits,
      occupiedUnits,
      expectedMonthlyRent,
      totalMonthlyRent,
      totalRentPaid,
      totalDepositDue: roundMoney(totalDepositDue),
      overduePayments,
      totalPayments,
      totalOverdueAmount: totalOverdueFromComponents,
      totalPenaltyAmount: roundMoney(totalPenaltyAmount),
      totalDepositPaid,
      totalUtilityPaid,
    };

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Owner stats error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}




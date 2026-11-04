import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { WithId, ObjectId } from "mongodb";
import { resolveTenantMonthlyRentForDate } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { summarizeTenantFinancialStates } from "@/lib/tenant-financial-view";
import { buildPropertyIdCandidates, countOccupiedUnitsForTenant, fetchTenantsActiveOnDay, fetchTenantsOverlappingRange } from "@/lib/tenant-occupancy";
import { getFinancialPaymentRows, summarizeFinancialPaymentRows } from "@/lib/financial-reporting";
import { businessMonthStart } from "@/lib/business-time";
import { identityValues } from "@/lib/payment-query";

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
  totalExpectedRent: number;
  totalRentOutstanding: number;
  totalOverdueRent: number;
  totalExpectedUtilities: number;
  totalUtilitiesOutstanding: number;
  totalOverdueUtilities: number;
  totalExpectedDeposits: number;
  totalOutstanding: number;
}

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const ACTIVE_PROPERTY_STATUSES = ["Active", "active"] as const;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      ownerId: { $in: identityValues(requestedOwnerId) },
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
      ownerId: { $in: identityValues(effectiveOwnerId) },
    };

    if (allowedPropertyIds) {
      propertyFilter._id = { $in: allowedPropertyIds.flatMap((id) => identityValues(id)) };
    }

    // Fetch active properties for the owner
    const activePropertyFilter: Record<string, unknown> = {
      ...propertyFilter,
      $or: [
        { status: { $in: ACTIVE_PROPERTY_STATUSES } },
        { status: { $exists: false } },
      ],
    };
    const properties = await db
      .collection("properties")
      .find<WithId<Property>>(propertyFilter)
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());
    const activeProperties = properties.filter((property) =>
      property.status == null || ACTIVE_PROPERTY_STATUSES.includes(property.status as any)
    );
    const activePropertyIds = activeProperties.map((property) => property._id.toString());
    const propertyIdCandidates = buildPropertyIdCandidates(propertyIds);
    const tenantPropertyFilter = { propertyId: { $in: propertyIdCandidates } } as any;
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
        totalExpectedRent: 0,
        totalRentOutstanding: 0,
        totalOverdueRent: 0,
        totalExpectedUtilities: 0,
        totalUtilitiesOutstanding: 0,
        totalOverdueUtilities: 0,
        totalExpectedDeposits: 0,
        totalOutstanding: 0,
      };
      return NextResponse.json({ success: true, stats }, { headers: NO_STORE_HEADERS });
    }

    const today = new Date();
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
          { $match: activePropertyFilter },
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
      tenantCollection.countDocuments(tenantPropertyFilter),
      tenantCollection.find(tenantPropertyFilter).toArray(),
      fetchTenantsActiveOnDay<TenantDoc>(db, activePropertyIds, today),
      fetchTenantsOverlappingRange<TenantDoc>(db, activePropertyIds, startOfMonth, endOfMonth),
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
        tenantIdsForUnresolvedProperty: tenantsForFinancials.map((tenant: any) => tenant._id),
        start: startOfMonth,
        end: today,
      }),
      getFinancialPaymentRows({
        db,
        propertyIds,
        tenantIdsForUnresolvedProperty: tenantsForFinancials.map((tenant: any) => tenant._id),
        end: today,
      }),
    ]);

    // Historical receipt categories use posted snapshots; current tenant
    // states are independently recalculated for outstanding balances.
    const allTenantStates = await Promise.all(tenantsForFinancials.map(async (tenant: any) => ({
      tenant,
      state: await calculateTenantFinancialState(db, tenant, {
        property: propertyMap.get(String(tenant.propertyId)),
        asOf: today,
        rentOverrideMap,
      }),
    })));
    const monthlySummary = summarizeFinancialPaymentRows(monthlyRows);
    const lifetimeSummary = summarizeFinancialPaymentRows(lifetimeRows);
    const rentCollectedThisMonth = roundMoney(monthlySummary.rentReceived);

    const totalMonthlyRent = rentCollectedThisMonth;

    // Total rent paid (all time)
    const totalPayments = roundMoney(lifetimeSummary.netReceived);

    // === Overdue Logic ===
    const activeTenantsForDues = activeTenantsForOccupancy;

    let overduePayments = 0;
    const activeTenantIds = new Set(activeTenantsForDues.map((tenant) => String(tenant._id)));
    const tenantStates = allTenantStates.filter(({ tenant }) => activeTenantIds.has(String(tenant._id)));
    overduePayments = tenantStates.filter(({ state }) => state.overdueAmount > 0).length;
    // Deposits must come from the same tenant ledger used for dues. Summing
    // raw payments with type "Deposit" incorrectly counts overpayments and
    // ignores payments whose allocation was split across charges.
    // Deposits remain held after tenancy ends, so the collected metric includes
    // every tenant ledger attached to an active owner property.
    const ledgerSummary = summarizeTenantFinancialStates(allTenantStates.map(({ state }) => state));
    // Cards that describe tenant balances use the same current tenant ledgers
    // as tenant and property detail. Payment trend totals remain a separate
    // posted receipt view, which can also include property-linked receipts
    // without a tenant relationship.
    const totalRentPaidFromTenants = ledgerSummary.rentCollected;
    const totalUtilityPaid = ledgerSummary.utilitiesCollected;
    const totalDepositPaid = ledgerSummary.depositsReceived;
    const totalDepositDue = ledgerSummary.depositsDue;

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
      activeProperties: activeProperties.length,
      totalTenants,
      activeTenants,
      totalUnits,
      occupiedUnits,
      expectedMonthlyRent,
      totalMonthlyRent,
      totalRentPaid: totalRentPaidFromTenants,
      totalDepositDue,
      overduePayments,
      totalPayments,
      totalOverdueAmount: roundMoney(ledgerSummary.overdueRent + ledgerSummary.overdueUtilities),
      totalPenaltyAmount: ledgerSummary.penalties,
      totalDepositPaid,
      totalUtilityPaid,
      totalExpectedRent: ledgerSummary.expectedRent,
      totalRentOutstanding: ledgerSummary.rentOutstanding,
      totalOverdueRent: ledgerSummary.overdueRent,
      totalExpectedUtilities: ledgerSummary.expectedUtilities,
      totalUtilitiesOutstanding: ledgerSummary.utilitiesOutstanding,
      totalOverdueUtilities: ledgerSummary.overdueUtilities,
      totalExpectedDeposits: ledgerSummary.expectedDeposits,
      totalOutstanding: ledgerSummary.totalOutstanding,
    };

    return NextResponse.json({ success: true, stats }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Owner stats error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}




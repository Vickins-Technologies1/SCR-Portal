import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { WithId, ObjectId } from "mongodb";
import { calculateOverduePenalty, calculateTenantRentDueToDate, resolveTenantMonthlyRentForDate, resolveTenantRequiredDeposit } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { getPaymentTotalsByTenantIds } from "@/lib/payment-totals";
import { countOccupiedUnitsForTenant, fetchTenantsActiveOnDay, fetchTenantsOverlappingRange } from "@/lib/tenant-occupancy";

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
  totalUnits: number;
  occupiedUnits: number;
  expectedMonthlyRent: number;
  totalMonthlyRent: number;
  totalRentPaid: number;
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
  let effectiveOwnerId = requestedOwnerId;
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
        totalUnits: 0,
        occupiedUnits: 0,
        expectedMonthlyRent: 0,
        totalMonthlyRent: 0,
        totalRentPaid: 0,
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
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfMonthISO = startOfMonth.toISOString();
    const endOfMonthISO = endOfMonth.toISOString();

    // === FIXED: Accurate totalUnits from unitTypes.quantity ===
    const totalUnitsResult = await db
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
      .toArray();
    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);

    const tenantCollection = db.collection<TenantDoc>("tenants");

    const activeTenantsForOccupancy = await fetchTenantsActiveOnDay<TenantDoc>(db, propertyIds, today);
    const activeTenantsForMonth = await fetchTenantsOverlappingRange<TenantDoc>(db, propertyIds, startOfMonth, endOfMonth);

    const totalTenants = activeTenantsForOccupancy.length;
    const occupiedUnits = activeTenantsForOccupancy.reduce(
      (sum, tenant) => sum + countOccupiedUnitsForTenant(tenant),
      0
    );

    const rentPaidThisMonthResult = await db
      .collection("payments")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
            type: "Rent",
            $or: [
              { paymentDate: { $gte: startOfMonth, $lte: endOfMonth } },
              { paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO } },
            ],
          },
        },
        {
          $group: {
            _id: "$tenantId",
            total: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    const rentCollectedThisMonth = roundMoney(
      rentPaidThisMonthResult.reduce((sum: number, row: any) => sum + Number(row.total || 0), 0)
    );

    const totalMonthlyRent = rentCollectedThisMonth;

    // Total rent paid (all time)
    const totalRentPaidResult = await db
      .collection("payments")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
            type: "Rent",
          },
        },
        {
          $group: {
            _id: null,
            totalRentPaid: { $sum: "$amount" },
          },
        },
      ])
      .toArray();
    const totalRentPaid = roundMoney(totalRentPaidResult[0]?.totalRentPaid || 0);

    // Total payments (all time)
    const paymentsResult = await db
      .collection("payments")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalPayments: { $sum: "$amount" },
          },
        },
      ])
      .toArray();
    const totalPayments = roundMoney(paymentsResult[0]?.totalPayments || 0);

    // Deposits
    const depositPaymentsResult = await db
      .collection("payments")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
            type: "Deposit",
          },
        },
        {
          $group: {
            _id: null,
            totalDepositPaid: { $sum: "$amount" },
          },
        },
      ])
      .toArray();
    const totalDepositPaid = roundMoney(depositPaymentsResult[0]?.totalDepositPaid || 0);

    // Utilities
    const utilityPaymentsResult = await db
      .collection("payments")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
            type: "Utility",
          },
        },
        {
          $group: {
            _id: null,
            totalUtilityPaid: { $sum: "$amount" },
          },
        },
      ])
      .toArray();
    const totalUtilityPaid = roundMoney(utilityPaymentsResult[0]?.totalUtilityPaid || 0);

    // === Overdue Logic ===
    const activeTenantsForDues = activeTenantsForOccupancy;

    const paymentTotalsByTenant = await getPaymentTotalsByTenantIds(
      db,
      activeTenantsForDues.map((tenant) => tenant._id)
    );

    let overduePayments = 0;
    let totalOverdueAmount = 0;
    let totalPenaltyAmount = 0;

    const bulkOps = activeTenantsForDues.map((tenant) => {
      const property = propertyMap.get(tenant.propertyId);
      const { rentDue } = calculateTenantRentDueToDate({
        tenant: tenant as any,
        today,
        rentOverrideMap,
      });
      const tenantTotals = paymentTotalsByTenant.get(tenant._id.toString()) || {
        rentPaid: 0,
        depositPaid: 0,
        utilityPaid: 0,
        totalPaid: 0,
      };
      const rentDues = Math.max(0, rentDue - tenantTotals.rentPaid);
      const penaltyDues = calculateOverduePenalty({
        rentDues,
        today,
        rentPaymentDate: property?.rentPaymentDate,
        leaseStartDate: tenant.leaseStartDate ?? undefined,
        penaltyAmount: property?.penaltyAmount,
        penaltyFrequency: property?.penaltyFrequency,
      });
      totalPenaltyAmount += penaltyDues;
      const totalDeposit = resolveTenantRequiredDeposit({
        tenant: tenant as any,
        unitTypes: property?.unitTypes as any,
      });
      const depositDues = Math.max(0, totalDeposit - tenantTotals.depositPaid);
      const totalOverdueAmountForTenant = roundMoney(rentDues + depositDues + penaltyDues);
      const roundedOverdue = roundMoney(totalOverdueAmountForTenant);

      if (roundedOverdue > 0) {
        overduePayments += 1;
        totalOverdueAmount += roundedOverdue;
      }

      return {
        updateOne: {
          filter: { _id: tenant._id },
          update: {
            $set: {
              paymentStatus: roundedOverdue > 0 ? "overdue" : "up-to-date",
              updatedAt: todayISO,
            },
          },
        },
      };
    });

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
      totalUnits,
      occupiedUnits,
      expectedMonthlyRent,
      totalMonthlyRent,
      totalRentPaid,
      overduePayments,
      totalPayments,
      totalOverdueAmount: roundMoney(totalOverdueAmount),
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




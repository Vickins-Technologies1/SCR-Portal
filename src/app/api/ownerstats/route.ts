import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { WithId, ObjectId } from "mongodb";
import { calculateOverduePenalty, calculateTenantRentDueToDate, resolveTenantMonthlyRentForDate } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { getPaymentTotalsByTenantIds } from "@/lib/payment-totals";

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
  totalDepositPaid: number;
  totalUtilityPaid: number;
}

const roundMoney = (value: number) => Math.round(value || 0);
const NON_OCCUPYING_STATUSES = ["terminated", "inactive", "moved out"] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("userId");

  if (!requestedOwnerId) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(requestedOwnerId)) {
    return NextResponse.json({ success: false, message: "Invalid userId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  const {cookies} = request;
  const role = cookies.get("role")?.value;
  const loggedInUserId = cookies.get("userId")?.value;

  let authorized = false;
  let effectiveOwnerId = requestedOwnerId;

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

    // Fetch properties for the owner
    const properties = await db
      .collection("properties")
      .find<WithId<Property>>({ ownerId: effectiveOwnerId })
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
        { $match: { ownerId: effectiveOwnerId } },
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

    const activeTenantsForOccupancy = await db.collection("tenants").find({
      propertyId: { $in: propertyIds },
      status: { $nin: NON_OCCUPYING_STATUSES },
      leaseStartDate: { $ne: null, $lte: todayISO },
      leaseEndDate: { $ne: null, $gte: todayISO },
    }).toArray();

    const activeTenantsForMonth = await db.collection("tenants").find({
      propertyId: { $in: propertyIds },
      status: { $nin: NON_OCCUPYING_STATUSES },
      leaseStartDate: { $ne: null, $lte: endOfMonthISO },
      leaseEndDate: { $ne: null, $gte: startOfMonthISO },
    }).toArray();

    const totalTenants = activeTenantsForOccupancy.length;
    const occupiedUnits = activeTenantsForOccupancy.reduce((sum, tenant: any) => {
      const unitCount = tenant.leasedUnits && tenant.leasedUnits.length > 0 ? tenant.leasedUnits.length : 1;
      return sum + unitCount;
    }, 0);

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

    const rentPaidThisMonthByTenant = new Map(
      rentPaidThisMonthResult.map((row: any) => [String(row._id), Number(row.total || 0)])
    );

    const totalMonthlyRent = roundMoney(
      activeTenantsForMonth.reduce((sum: number, tenant: any) => {
        const currentMonthRent = resolveTenantMonthlyRentForDate({
          tenant,
          date: startOfMonth,
          rentOverrideMap,
        });
        const paidThisMonth = rentPaidThisMonthByTenant.get(tenant._id.toString()) ?? 0;
        return sum + Math.min(currentMonthRent, paidThisMonth);
      }, 0)
    );

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
        leaseStartDate: tenant.leaseStartDate,
        penaltyAmount: property?.penaltyAmount,
        penaltyFrequency: property?.penaltyFrequency,
      });
      const totalDeposit = tenant.leasedUnits && tenant.leasedUnits.length > 0
        ? tenant.leasedUnits.reduce((sum: number, unit: { deposit?: number }) => sum + (unit.deposit || 0), 0)
        : (tenant.deposit || 0);
      const totalDue = rentDue + totalDeposit + penaltyDues;
      const totalPaid =
        tenantTotals.rentPaid + tenantTotals.depositPaid + tenantTotals.utilityPaid;
      const totalOverdueAmountForTenant = Math.max(0, totalDue - totalPaid);
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
      await db.collection("tenants").bulkWrite(bulkOps);
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




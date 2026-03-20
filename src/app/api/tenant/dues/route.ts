// src/app/api/tenant/dues/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { WithId, ObjectId } from "mongodb";
import { calculateRentDueToDate, calculateTenantDues } from "@/lib/utils";

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
  status: string;
  ownerId: string;
  createdAt: string;
  rentPaymentDate?: number;
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
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();

    // Fetch properties for the owner
    const properties = await db
      .collection("properties")
      .find<WithId<Property>>({ ownerId: userId })
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());

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
      return NextResponse.json({ success: true, stats });
    }

    logger.debug("Properties fetched for ownerstats", { userId, propertyIds });

    // Define current month range
    const today = new Date(); // Use current date
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfMonthISO = startOfMonth.toISOString();
    const endOfMonthISO = endOfMonth.toISOString();

    // Total units aggregation
    const totalUnitsResult = await db
      .collection("properties")
      .aggregate<{ totalUnits: number }>([
        { $match: { ownerId: userId } },
        { $unwind: "$unitTypes" },
        { $group: { _id: null, totalUnits: { $sum: "$unitTypes.quantity" } } },
      ])
      .toArray();
    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    // Tenants and occupied units aggregation
    const tenantsResult = await db
      .collection("tenants")
      .aggregate<{
        totalTenants: number;
        occupiedUnits: number;
        tenantIds: string[];
      }>([
        { $match: { propertyId: { $in: propertyIds } } },
        {
          $group: {
            _id: null,
            totalTenants: { $sum: 1 },
            occupiedUnits: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lte: ["$leaseStartDate", today.toISOString()] },
                      { $gte: ["$leaseEndDate", today.toISOString()] },
                      { $ne: ["$leaseStartDate", null] },
                      { $ne: ["$leaseEndDate", null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            tenantIds: { $push: "$_id" },
          },
        },
      ])
      .toArray();
    const { totalTenants = 0, occupiedUnits = 0, tenantIds = [] } = tenantsResult[0] || {};

    logger.debug("Tenants fetched for ownerstats", { userId, tenantIds, totalTenants, occupiedUnits });

    // Current month rent
    const currentMonthRentResult = await db
      .collection("payments")
      .aggregate<{
        totalMonthlyRent: number;
      }>([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
            type: "Rent",
            paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO },
          },
        },
        {
          $group: {
            _id: null,
            totalMonthlyRent: { $sum: "$amount" },
          },
        },
      ])
      .toArray();
    const totalMonthlyRent = currentMonthRentResult[0]?.totalMonthlyRent || 0;

    const currentMonthPayments = await db
      .collection("payments")
      .find({
        propertyId: { $in: propertyIds },
        status: "completed",
        type: "Rent",
        paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO },
      })
      .toArray();
    logger.debug("Current month payments for totalMonthlyRent", {
      userId,
      paymentCount: currentMonthPayments.length,
      totalMonthlyRent,
      paymentIds: currentMonthPayments.map((p) => p._id),
      paymentDates: currentMonthPayments.map((p) => p.paymentDate),
      propertyIds,
    });

    // Total payments aggregation
    const paymentsResult = await db
      .collection("payments")
      .aggregate<{
        totalPayments: number;
      }>([
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
    const totalPayments = paymentsResult[0]?.totalPayments || 0;

    const activeTenants = await db
      .collection("tenants")
      .find({
        propertyId: { $in: propertyIds },
        leaseStartDate: { $ne: null, $lte: today.toISOString() },
        leaseEndDate: { $ne: null, $gte: today.toISOString() },
      })
      .toArray();

    let overduePayments = 0;
    let totalOverdueAmount = 0;

    const bulkOps = activeTenants.map((tenant) => {
      const tenantObjectId = typeof tenant._id === "string" ? new ObjectId(tenant._id) : tenant._id;
      const { rentDue } = calculateRentDueToDate({
        leaseStartDate: tenant.leaseStartDate,
        monthlyRent: tenant.price || 0,
        today,
      });
      const totalDue = rentDue + (tenant.deposit || 0);
      const totalPaid =
        (tenant.totalRentPaid || 0) +
        (tenant.totalUtilityPaid || 0) +
        (tenant.totalDepositPaid || 0);
      const walletCredit = tenant.walletBalance || 0;
      const totalOverdue = Math.max(0, totalDue - totalPaid - walletCredit);

      if (totalOverdue > 0) {
        overduePayments += 1;
        totalOverdueAmount += totalOverdue;
      }

      return {
        updateOne: {
          filter: { _id: tenantObjectId },
          update: {
            $set: {
              paymentStatus: totalOverdue > 0 ? "overdue" : "up-to-date",
              updatedAt: today.toISOString(),
            },
          },
        },
      };
    });

    if (bulkOps.length > 0) {
      await db.collection("tenants").bulkWrite(bulkOps);
      logger.debug("Bulk tenant updates executed", { userId, updateCount: bulkOps.length });
    }

    const stats: Stats = {
      activeProperties: properties.length,
      totalTenants,
      totalUnits,
      occupiedUnits,
      totalMonthlyRent,
      overduePayments,
      totalPayments,
      totalOverdueAmount,
    };

    logger.debug("Successfully fetched owner stats", { userId, stats });
    return NextResponse.json({ success: true, stats });
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
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
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

    const today = new Date(); // Use current date
    const dues = await calculateTenantDues(db, tenant as any, today);

    await db.collection("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      {
        $set: {
          paymentStatus: dues.totalRemainingDues > 0 ? "overdue" : "up-to-date",
          updatedAt: today.toISOString(),
        },
      }
    );

    logger.debug("Successfully calculated tenant dues", {
      tenantId,
      userId,
      dues,
      monthsStayed: dues.monthsStayed,
    });
    return NextResponse.json({ success: true, dues, monthsStayed: dues.monthsStayed });
  } catch (error) {
    logger.error("Error processing tenant dues", {
      tenantId: (await request.json())?.tenantId || "unknown",
      userId: (await request.json())?.userId || "unknown",
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

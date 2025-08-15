import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { WithId, ObjectId } from "mongodb";

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
  totalDepositPaid: number;
  totalUtilityPaid: number;
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
        totalDepositPaid: 0,
        totalUtilityPaid: 0,
      };
      return NextResponse.json({ success: true, stats });
    }

    logger.debug("Properties fetched for ownerstats", { userId, propertyIds });

    // Define current month range (August 2025, EAT)
    const today = new Date("2025-08-14T13:29:00+03:00");
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

    // Current month rent (sum of completed rent payments for the month)
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

    // Total rent payments aggregation (only completed rent payments)
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

    // Total deposit payments aggregation
    const depositPaymentsResult = await db
      .collection("payments")
      .aggregate<{
        totalDepositPaid: number;
      }>([
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
    const totalDepositPaid = depositPaymentsResult[0]?.totalDepositPaid || 0;

    // Total utility payments aggregation
    const utilityPaymentsResult = await db
      .collection("payments")
      .aggregate<{
        totalUtilityPaid: number;
      }>([
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
    const totalUtilityPaid = utilityPaymentsResult[0]?.totalUtilityPaid || 0;

    // Overdue payments aggregation
    const overdueResult = await db
      .collection("tenants")
      .aggregate<{
        tenantId: string;
        totalRentDue: number;
        totalDepositDue: number;
        totalUtilityDue: number;
        totalOverdueAmount: number;
        paymentStatus: string;
      }>([
        { $match: { propertyId: { $in: propertyIds } } },
        {
          $match: {
            leaseStartDate: { $ne: null, $lte: today.toISOString() },
            leaseEndDate: { $ne: null, $gte: today.toISOString() },
          },
        },
        {
          $project: {
            _id: 0,
            tenantId: "$_id",
            totalRentDue: {
              $cond: {
                if: { $and: [{ $ne: ["$price", null] }, { $ne: ["$leaseStartDate", null] }] },
                then: {
                  $multiply: [
                    "$price",
                    {
                      $dateDiff: {
                        startDate: { $toDate: "$leaseStartDate" },
                        endDate: today,
                        unit: "month",
                      },
                    },
                  ],
                },
                else: 0,
              },
            },
            totalDepositDue: { $ifNull: ["$deposit", 0] },
            totalUtilityDue: { $literal: 0 }, // Utility dues not tracked
            totalOverdueAmount: {
              $max: [
                0,
                {
                  $subtract: [
                    {
                      $add: [
                        {
                          $cond: {
                            if: { $and: [{ $ne: ["$price", null] }, { $ne: ["$leaseStartDate", null] }] },
                            then: {
                              $multiply: [
                                "$price",
                                {
                                  $dateDiff: {
                                    startDate: { $toDate: "$leaseStartDate" },
                                    endDate: today,
                                    unit: "month",
                                  },
                                },
                              ],
                            },
                            else: 0,
                          },
                        },
                        { $ifNull: ["$deposit", 0] },
                        { $literal: 0 }, // Utility dues not tracked
                      ],
                    },
                    {
                      $add: [
                        { $ifNull: ["$totalRentPaid", 0] },
                        { $ifNull: ["$totalUtilityPaid", 0] },
                        { $ifNull: ["$totalDepositPaid", 0] },
                      ],
                    },
                  ],
                },
              ],
            },
            paymentStatus: "$paymentStatus",
          },
        },
        {
          $match: { totalOverdueAmount: { $gt: 0 } },
        },
      ])
      .toArray();

    const overduePayments = overdueResult.length;
    const totalOverdueAmount = overdueResult.reduce((sum, tenant) => sum + tenant.totalOverdueAmount, 0);

    // Update tenant paymentStatus
    const bulkOps = overdueResult.map((tenant) => ({
      updateOne: {
        filter: { _id: new ObjectId(tenant.tenantId) },
        update: {
          $set: {
            paymentStatus: tenant.totalOverdueAmount > 0 ? "overdue" : "up-to-date",
            updatedAt: today.toISOString(),
          },
        },
      },
    }));

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
      totalDepositPaid,
      totalUtilityPaid,
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
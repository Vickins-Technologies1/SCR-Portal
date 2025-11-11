import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
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
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Invalid userId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
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

    // Define current month range
    const today = new Date();
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

    // Current month rent
    const currentMonthRentResult = await db
      .collection("payments")
      .aggregate<{
        totalMonthlyRent: number;
        paymentCount: number;
      }>([
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
            _id: null,
            totalMonthlyRent: { $sum: "$amount" },
            paymentCount: { $sum: 1 },
          },
        },
      ])
      .toArray();
    const totalMonthlyRent = currentMonthRentResult[0]?.totalMonthlyRent || 0;

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

    // === FINAL FIX: paymentStatus = "up-to-date" ONLY if overdue = 0 ===
    const todayISO = today.toISOString();

    const tenantDuesResult = await db
      .collection("tenants")
      .aggregate<{
        _id: ObjectId;
        totalOverdueAmount: number;
      }>([
        // Match only currently active tenants
        {
          $match: {
            propertyId: { $in: propertyIds },
            leaseStartDate: { $ne: null, $lte: todayISO },
            leaseEndDate: { $ne: null, $gte: todayISO },
          },
        },
        // Calculate months stayed (including current month)
        {
          $addFields: {
            monthsStayed: {
              $cond: [
                { $ne: ["$leaseStartDate", null] },
                {
                  $add: [
                    {
                      $dateDiff: {
                        startDate: { $toDate: "$leaseStartDate" },
                        endDate: today,
                        unit: "month",
                      },
                    },
                    {
                      $cond: [
                        { $lte: [{ $toDate: "$leaseStartDate" }, today] },
                        1,
                        0,
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },
        },
        // Calculate total due and total paid
        {
          $project: {
            _id: 1,
            totalDue: {
              $add: [
                { $multiply: [{ $ifNull: ["$price", 0] }, "$monthsStayed"] },
                { $ifNull: ["$deposit", 0] },
                { $literal: 0 }, // utility
              ],
            },
            totalPaid: {
              $add: [
                { $ifNull: ["$totalRentPaid", 0] },
                { $ifNull: ["$totalDepositPaid", 0] },
                { $ifNull: ["$totalUtilityPaid", 0] },
              ],
            },
          },
        },
        // Final overdue amount
        {
          $project: {
            _id: 1,
            totalOverdueAmount: {
              $max: [0, { $subtract: ["$totalDue", "$totalPaid"] }],
            },
          },
        },
      ])
      .toArray();

    // Count overdue tenants and sum total overdue
    const overduePayments = tenantDuesResult.filter(t => t.totalOverdueAmount > 0).length;
    const totalOverdueAmount = tenantDuesResult.reduce((sum, t) => sum + t.totalOverdueAmount, 0);

    // Update paymentStatus: "up-to-date" ONLY if overdue === 0
    const bulkOps = tenantDuesResult.map((tenant) => ({
      updateOne: {
        filter: { _id: tenant._id },
        update: {
          $set: {
            paymentStatus: tenant.totalOverdueAmount > 0 ? "overdue" : "up-to-date",
            updatedAt: todayISO,
          },
        },
      },
    }));

    if (bulkOps.length > 0) {
      await db.collection("tenants").bulkWrite(bulkOps);
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

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
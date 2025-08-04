
// File: src/app/api/ownerstats/route.ts
import { NextResponse, NextRequest } from "next/server";
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
}

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  leaseStartDate: string;
  leaseEndDate: string;
  walletBalance?: number;
}

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  type?: "Rent" | "Utility";
  phoneNumber?: string;
  reference?: string;
  tenantName: string;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    logger.error("Missing userId in ownerstats request");
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
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
    const propertyIds = properties.map((p) => new ObjectId(p._id));

    // Define current month range (August 2025)
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
      }>([
        { $match: { propertyId: { $in: propertyIds.map(id => id.toString()) } } },
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
          },
        },
      ])
      .toArray();
    const { totalTenants = 0, occupiedUnits = 0 } = tenantsResult[0] || {};

    // Current month rent (sum of completed rent payments in August 2025)
    const currentMonthRentResult = await db
      .collection("payments")
      .aggregate<{
        totalMonthlyRent: number;
      }>([
        {
          $match: {
            propertyId: { $in: propertyIds.map(id => id.toString()) },
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

    // Log payments for debugging
    const currentMonthPayments = await db
      .collection("payments")
      .find({
        propertyId: { $in: propertyIds.map(id => id.toString()) },
        status: "completed",
        type: "Rent",
        paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO },
      })
      .toArray();
    logger.debug("Current month payments for totalMonthlyRent", {
      userId,
      paymentCount: currentMonthPayments.length,
      totalMonthlyRent,
      paymentIds: currentMonthPayments.map(p => p._id.toString()),
      paymentDates: currentMonthPayments.map(p => p.paymentDate),
    });

    // Total payments aggregation (all completed rent payments)
    const paymentsResult = await db
      .collection("payments")
      .aggregate<{
        totalPayments: number;
      }>([
        {
          $match: {
            propertyId: { $in: propertyIds.map(id => id.toString()) },
            status: "completed",
            type: "Rent",
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

    // Overdue payments calculation
    const tenants = await db
      .collection("tenants")
      .find<WithId<Tenant>>({ propertyId: { $in: propertyIds.map(id => id.toString()) } })
      .toArray();
    const payments = await db
      .collection("payments")
      .find<WithId<Payment>>({ propertyId: { $in: propertyIds.map(id => id.toString()) } })
      .toArray();

    let overduePayments = 0;
    let totalOverdueAmount = 0;
    tenants.forEach((tenant: Tenant) => {
      if (!tenant.leaseStartDate || !tenant.leaseEndDate || !tenant.price) return;
      const leaseStart = new Date(tenant.leaseStartDate);
      const leaseEnd = new Date(tenant.leaseEndDate);
      if (isNaN(leaseStart.getTime()) || isNaN(leaseEnd.getTime()) || leaseStart > today || leaseEnd < today) return;
      const monthsSinceLease = Math.max(
        0,
        Math.floor((today.getTime() - leaseStart.getTime()) / (1000 * 60 * 60 * 24 * 30))
      );
      const expectedRent = monthsSinceLease * tenant.price;
      const totalPaid = payments
        .filter((p) => p.tenantId === tenant._id.toString() && p.status === "completed" && p.type === "Rent")
        .reduce((sum, p) => sum + p.amount, 0);
      const overdueAmount = Math.max(0, expectedRent - totalPaid - (tenant.walletBalance || 0));
      if (overdueAmount > 0) {
        overduePayments += 1;
        totalOverdueAmount += overdueAmount;
      }
    });

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
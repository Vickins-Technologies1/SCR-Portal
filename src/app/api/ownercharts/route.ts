import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { WithId, ObjectId } from "mongodb";

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  maintenanceRequests: number[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyOwnerId = searchParams.get("propertyOwnerId");

  if (!propertyOwnerId) {
    logger.error("Missing propertyOwnerId in ownercharts request");
    return NextResponse.json({ success: false, message: "propertyOwnerId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(propertyOwnerId)) {
    logger.error("Invalid propertyOwnerId format", { propertyOwnerId });
    return NextResponse.json({ success: false, message: "Invalid propertyOwnerId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    logger.error("Invalid CSRF token in ownercharts request", { propertyOwnerId });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();

    // Fetch properties for the owner
    const properties = await db
      .collection("properties")
      .find<WithId<{ _id: string }>>({ ownerId: propertyOwnerId })
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());

    if (properties.length === 0) {
      logger.debug("No properties found for owner", { propertyOwnerId });
      return NextResponse.json({
        success: true,
        chartData: {
          months: [],
          rentPayments: [],
          utilityPayments: [],
          maintenanceRequests: [],
        },
      });
    }

    logger.debug("Properties fetched for ownercharts", { propertyOwnerId, propertyIds });

    // Fetch all tenants for the owner's properties
    const tenants = await db
      .collection("tenants")
      .find<WithId<{ _id: string }>>({ propertyId: { $in: propertyIds } })
      .toArray();
    const tenantIds = tenants.map((t) => t._id.toString());

    if (tenantIds.length === 0) {
      logger.debug("No tenants found for owner's properties", { propertyOwnerId });
      return NextResponse.json({
        success: true,
        chartData: {
          months: [],
          rentPayments: [],
          utilityPayments: [],
          maintenanceRequests: [],
        },
      });
    }

    logger.debug("Tenants fetched for ownercharts", { propertyOwnerId, tenantIds });

    // Define the last six months range (September 2025 backwards, UTC for consistency)
    const today = new Date(); // Current date: September 4, 2025, 2:54 PM EAT
    const months: string[] = [];
    const rentPayments: number[] = [];
    const utilityPayments: number[] = [];
    const maintenanceRequests: number[] = [];

    for (let i = 0; i < 6; i++) {
      // Use UTC to align with paymentDate format
      const monthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      const monthLabel = monthDate.toLocaleString("en-US", { month: "short", year: "2-digit" });
      months.unshift(monthLabel);

      const startOfMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
      const endOfMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const startOfMonthISO = startOfMonth.toISOString();
      const endOfMonthISO = endOfMonth.toISOString();

      logger.debug("Processing month for chart data", {
        propertyOwnerId,
        month: monthLabel,
        startOfMonth: startOfMonthISO,
        endOfMonth: endOfMonthISO,
      });

      // Aggregate rent payments
      const rentPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number; count: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              status: "completed",
              type: "Rent",
              $or: [
                { paymentDate: { $gte: startOfMonth, $lte: endOfMonth } }, // For Date objects
                { paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO } }, // For ISO strings
              ],
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const rentTotal = rentPaymentsResult[0]?.total || 0;
      const rentCount = rentPaymentsResult[0]?.count || 0;
      rentPayments.unshift(rentTotal);

      logger.debug("Rent payments for month", {
        propertyOwnerId,
        month: monthLabel,
        total: rentTotal,
        count: rentCount,
      });

      // Aggregate utility payments
      const utilityPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number; count: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              status: "completed",
              type: "Utility",
              $or: [
                { paymentDate: { $gte: startOfMonth, $lte: endOfMonth } },
                { paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO } },
              ],
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const utilityTotal = utilityPaymentsResult[0]?.total || 0;
      const utilityCount = utilityPaymentsResult[0]?.count || 0;
      utilityPayments.unshift(utilityTotal);

      logger.debug("Utility payments for month", {
        propertyOwnerId,
        month: monthLabel,
        total: utilityTotal,
        count: utilityCount,
      });

      // Aggregate maintenance requests
      const maintenanceResult = await db
        .collection("maintenanceRequests")
        .aggregate<{ count: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              $or: [
                { createdAt: { $gte: startOfMonth, $lte: endOfMonth } },
                { createdAt: { $gte: startOfMonthISO, $lte: endOfMonthISO } },
              ],
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const maintenanceCount = maintenanceResult[0]?.count || 0;
      maintenanceRequests.unshift(maintenanceCount);

      logger.debug("Maintenance requests for month", {
        propertyOwnerId,
        month: monthLabel,
        count: maintenanceCount,
      });
    }

    // Debug: Fetch sample payments to verify data
    const samplePayments = await db
      .collection("payments")
      .find({
        tenantId: { $in: tenantIds },
        propertyId: { $in: propertyIds },
        status: "completed",
        type: "Rent",
      })
      .limit(10)
      .toArray();
    logger.debug("Sample rent payments for owner", {
      propertyOwnerId,
      paymentCount: samplePayments.length,
      paymentDates: samplePayments.map((p) => p.paymentDate),
      paymentAmounts: samplePayments.map((p) => p.amount),
    });

    const chartData: ChartData = {
      months,
      rentPayments,
      utilityPayments,
      maintenanceRequests,
    };

    logger.debug("Successfully fetched owner chart data", { propertyOwnerId, chartData });
    return NextResponse.json({ success: true, chartData });
  } catch (error) {
    logger.error("Error fetching owner chart data", {
      propertyOwnerId,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
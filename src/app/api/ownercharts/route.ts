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

    // Define the last six months range (August 2025 backwards, EAT)
    const today = new Date("2025-08-14T14:46:00+03:00");
    // Generate month labels (e.g., "Mar 25", "Apr 25", ..., "Aug 25")
    const months: string[] = [];
    const rentPayments: number[] = [];
    const utilityPayments: number[] = [];
    const maintenanceRequests: number[] = [];

    for (let i = 0; i < 6; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthLabel = monthDate.toLocaleString("en-US", { month: "short", year: "2-digit" });
      months.unshift(monthLabel);

      const startOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const startOfMonthISO = startOfMonth.toISOString();
      const endOfMonthISO = endOfMonth.toISOString();

      // Aggregate rent payments
      const rentPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              status: "completed",
              type: "Rent",
              paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ])
        .toArray();
      rentPayments.unshift(rentPaymentsResult[0]?.total || 0);

      // Aggregate utility payments
      const utilityPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              status: "completed",
              type: "Utility",
              paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ])
        .toArray();
      utilityPayments.unshift(utilityPaymentsResult[0]?.total || 0);

      // Aggregate maintenance requests
      const maintenanceResult = await db
        .collection("maintenanceRequests")
        .aggregate<{ count: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              createdAt: { $gte: startOfMonthISO, $lte: endOfMonthISO },
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
      maintenanceRequests.unshift(maintenanceResult[0]?.count || 0);
    }

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
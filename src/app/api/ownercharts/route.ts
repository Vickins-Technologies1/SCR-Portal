import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { WithId, ObjectId } from "mongodb";

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyOwnerId = searchParams.get("propertyOwnerId");

  if (!propertyOwnerId) {
    return NextResponse.json({ success: false, message: "propertyOwnerId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(propertyOwnerId)) {
    return NextResponse.json({ success: false, message: "Invalid propertyOwnerId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
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
      return NextResponse.json({
        success: true,
        chartData: {
          months: [],
          rentPayments: [],
          utilityPayments: [],
          depositPayments: [],
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
      return NextResponse.json({
        success: true,
        chartData: {
          months: [],
          rentPayments: [],
          utilityPayments: [],
          depositPayments: [],
        },
      });
    }

    // Define the last six months range
    const today = new Date();
    const months: string[] = [];
    const rentPayments: number[] = [];
    const utilityPayments: number[] = [];
    const depositPayments: number[] = [];

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
        .aggregate<{ total: number; count: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
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
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const rentTotal = rentPaymentsResult[0]?.total || 0;
      rentPayments.unshift(rentTotal);

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
      utilityPayments.unshift(utilityTotal);

      // Aggregate deposit payments
      const depositPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number; count: number }>([
          {
            $match: {
              tenantId: { $in: tenantIds },
              propertyId: { $in: propertyIds },
              status: "completed",
              type: "Deposit",
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
      const depositTotal = depositPaymentsResult[0]?.total || 0;
      depositPayments.unshift(depositTotal);
    }

    const chartData: ChartData = {
      months,
      rentPayments,
      utilityPayments,
      depositPayments,
    };

    return NextResponse.json({ success: true, chartData });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");

  if (!propertyId) {
    return NextResponse.json({ success: false, message: "propertyId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(propertyId)) {
    return NextResponse.json({ success: false, message: "Invalid propertyId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return buildInvalidCsrfResponse(request);
  }

  const { cookies } = request;
  const role = cookies.get("role")?.value;
  const loggedInUserId = cookies.get("userId")?.value;

  if (!loggedInUserId || !role) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!["propertyOwner", "teamMember", "admin"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();

    const property = await db.collection("properties").findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    if (role === "propertyOwner" && property.ownerId?.toString() !== loggedInUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(loggedInUserId),
        ownerId: new ObjectId(property.ownerId),
        active: true,
      });
      if (!teamMember) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }
    }

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

      const rentPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number }>([
          {
            $match: {
              propertyId,
              status: "completed",
              type: "Rent",
              $or: [
                { paymentDate: { $gte: startOfMonth, $lte: endOfMonth } },
                { paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO } },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      const utilityPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number }>([
          {
            $match: {
              propertyId,
              status: "completed",
              type: "Utility",
              $or: [
                { paymentDate: { $gte: startOfMonth, $lte: endOfMonth } },
                { paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO } },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      const depositPaymentsResult = await db
        .collection("payments")
        .aggregate<{ total: number }>([
          {
            $match: {
              propertyId,
              status: "completed",
              type: "Deposit",
              $or: [
                { paymentDate: { $gte: startOfMonth, $lte: endOfMonth } },
                { paymentDate: { $gte: startOfMonthISO, $lte: endOfMonthISO } },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      rentPayments.unshift(rentPaymentsResult[0]?.total || 0);
      utilityPayments.unshift(utilityPaymentsResult[0]?.total || 0);
      depositPayments.unshift(depositPaymentsResult[0]?.total || 0);
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

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getFinancialPaymentRows } from "@/lib/financial-reporting";

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
    const nairobiParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "numeric",
    }).formatToParts(today);
    const currentYear = Number(nairobiParts.find((part) => part.type === "year")?.value);
    const currentMonth = Number(nairobiParts.find((part) => part.type === "month")?.value) - 1;
    const periodStart = new Date(Date.UTC(currentYear, currentMonth - 5, 1) - 3 * 60 * 60 * 1000);
    const periodEnd = new Date(Date.UTC(currentYear, currentMonth + 1, 1) - 3 * 60 * 60 * 1000 - 1);
    const rows = await getFinancialPaymentRows({ db, propertyIds: [propertyId], start: periodStart, end: periodEnd });
    const months: string[] = [];
    const monthKeys: string[] = [];
    const rentPayments: number[] = [];
    const utilityPayments: number[] = [];
    const depositPayments: number[] = [];
    const totalsByMonth = new Map<string, { rent: number; utility: number; deposit: number }>();

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(Date.UTC(currentYear, currentMonth - i, 1));
      const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
      monthKeys.push(monthKey);
      months.push(monthDate.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "Africa/Nairobi" }));
      totalsByMonth.set(monthKey, { rent: 0, utility: 0, deposit: 0 });
    }

    const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" });
    for (const row of rows) {
      if (!row.eventDate) continue;
      const parts = monthFormatter.formatToParts(row.eventDate);
      const key = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
      const totals = totalsByMonth.get(key);
      if (!totals) continue;
      totals.rent += row.allocation.rent;
      totals.utility += row.allocation.utilities;
      totals.deposit += row.allocation.deposit;
    }
    for (const key of monthKeys) {
      const totals = totalsByMonth.get(key) || { rent: 0, utility: 0, deposit: 0 };
      rentPayments.push(Math.round(totals.rent * 100) / 100);
      utilityPayments.push(Math.round(totals.utility * 100) / 100);
      depositPayments.push(Math.round(totals.deposit * 100) / 100);
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

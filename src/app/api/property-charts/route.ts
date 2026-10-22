import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getFinancialPaymentRows, summarizeFinancialPaymentPeriods } from "@/lib/financial-reporting";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";

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
    const tenants = await db.collection("tenants").find({ propertyId: { $in: [propertyId, new ObjectId(propertyId)] } }).toArray();
    const tenantStates = await Promise.all(tenants.map((tenant: any) =>
      calculateTenantFinancialState(db, tenant, { property, asOf: today })
    ));
    const allocationOverrides = new Map<string, any>();
    for (const state of tenantStates) {
      for (const [paymentId, allocation] of state.paymentAllocations) allocationOverrides.set(paymentId, allocation);
    }
    const periods = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(Date.UTC(currentYear, currentMonth - 5 + index, 1));
      const start = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1) - 3 * 60 * 60 * 1000);
      const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1) - 3 * 60 * 60 * 1000 - 1);
      return {
        key: `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`,
        label: monthDate.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "Africa/Nairobi" }),
        start,
        end: index === 5 ? today : monthEnd,
      };
    });
    const rows = await getFinancialPaymentRows({
      db,
      propertyIds: [propertyId],
      tenantIdsForLegacyPropertyless: tenants.map((tenant: any) => tenant._id),
      start: periods[0].start,
      end: today,
    });
    const summaries = summarizeFinancialPaymentPeriods(rows, periods, allocationOverrides);
    const months = summaries.map(({ label }) => label);
    const rentPayments = summaries.map(({ summary }) => summary.rentReceived);
    const utilityPayments = summaries.map(({ summary }) => summary.utilityReceived);
    const depositPayments = summaries.map(({ summary }) => summary.depositReceived);

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

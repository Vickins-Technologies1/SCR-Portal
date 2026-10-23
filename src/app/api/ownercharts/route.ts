import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { ObjectId } from "mongodb";
import { getFinancialPaymentRows, summarizeFinancialPaymentPeriods } from "@/lib/financial-reporting";
import { businessMonthStart } from "@/lib/business-time";

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
  otherPayments: number[];
  walletCreditPayments: number[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("propertyOwnerId");
  const requestedPropertyId = searchParams.get("propertyId");

  if (!requestedOwnerId) {
    return NextResponse.json({ success: false, message: "propertyOwnerId is required" }, { status: 400 });
  }

  if (!ObjectId.isValid(requestedOwnerId)) {
    return NextResponse.json({ success: false, message: "Invalid propertyOwnerId format" }, { status: 400 });
  }

  if (requestedPropertyId && !ObjectId.isValid(requestedPropertyId)) {
    return NextResponse.json({ success: false, message: "Invalid propertyId format" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return buildInvalidCsrfResponse(request);
  }

  const {cookies} = request;
  const role = cookies.get("role")?.value;
  const loggedInUserId = cookies.get("userId")?.value;

  let authorized = false;
  const effectiveOwnerId = requestedOwnerId;
  let teamMemberAssignedPropertyIds: string[] | null = null;

  if (role === "propertyOwner") {
    if (loggedInUserId === requestedOwnerId) {
      authorized = true;
    }
  } else if (role === "teamMember") {
    if (!loggedInUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const teamMember = await db.collection("teamMembers").findOne({
      _id: new ObjectId(loggedInUserId),
      ownerId: new ObjectId(requestedOwnerId),
      active: true,
    });

    if (teamMember) {
      authorized = true;
      teamMemberAssignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
        ? Array.from(
            new Set(
              (teamMember as any).assignedPropertyIds
                .map((value: any) => String(value || "").trim())
                .filter((value: string) => ObjectId.isValid(value))
            )
          )
        : null;
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, message: "Unauthorized: You do not have access to this owner's data" },
      { status: 403 }
    );
  }

  try {
    const { db } = await connectToDatabase();

    if (
      role === "teamMember" &&
      requestedPropertyId &&
      teamMemberAssignedPropertyIds &&
      teamMemberAssignedPropertyIds.length > 0 &&
      !teamMemberAssignedPropertyIds.includes(requestedPropertyId)
    ) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: You do not have access to this property" },
        { status: 403 }
      );
    }

    const allowedPropertyIds =
      requestedPropertyId
        ? [requestedPropertyId]
        : role === "teamMember" && teamMemberAssignedPropertyIds && teamMemberAssignedPropertyIds.length > 0
          ? teamMemberAssignedPropertyIds
          : null;

    // Fetch properties for the owner (optionally filtered by assignment / selection)
    const propertyQuery: Record<string, unknown> = {
      ownerId: effectiveOwnerId,
      $or: [
        { status: { $in: ["Active", "active"] } },
        { status: { $exists: false } },
      ],
    };
    if (allowedPropertyIds) {
      propertyQuery._id = { $in: allowedPropertyIds.map((id) => new ObjectId(id)) };
    }

    const properties = await db
      .collection("properties")
      .find<any>(propertyQuery)
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
          otherPayments: [],
          walletCreditPayments: [],
        },
      });
    }

    // Match report dates and the per-property chart: payment months are
    // calendar months in the application's Nairobi business timezone.
    const today = new Date();
    const nairobiParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "numeric",
    }).formatToParts(today);
    const currentYear = Number(nairobiParts.find((part) => part.type === "year")?.value);
    const currentMonth = Number(nairobiParts.find((part) => part.type === "month")?.value) - 1;
    const months: string[] = [];
    const rentPayments: number[] = [];
    const utilityPayments: number[] = [];
    const depositPayments: number[] = [];
    const otherPayments: number[] = [];
    const walletCreditPayments: number[] = [];

    // The saved payment allocation is a snapshot and can be stale when an
    // earlier payment was reallocated after a lease or utility change. Use
    // the same tenant ledger calculation as the owner dashboard cards.
    const tenants = await db.collection("tenants").find({ propertyId: { $in: propertyIds } }).toArray();

    const monthBuckets = Array.from({ length: 6 }, (_, i) => {
      const monthDate = new Date(Date.UTC(currentYear, currentMonth - i, 1));
      const start = businessMonthStart(monthDate.getUTCFullYear(), monthDate.getUTCMonth());
      const nextMonthStart = businessMonthStart(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1);
      const monthEnd = new Date(nextMonthStart.getTime() - 1);
      return {
        key: `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`,
        label: monthDate.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "Africa/Nairobi" }),
        start,
        end: i === 0 ? today : monthEnd,
      };
    }).reverse();
    const paymentRows = await getFinancialPaymentRows({
      db,
      propertyIds,
      tenantIdsForLegacyPropertyless: tenants.map((tenant: any) => tenant._id),
      start: monthBuckets[0].start,
      end: today,
    });

    const monthlySummaries = summarizeFinancialPaymentPeriods(paymentRows, monthBuckets);
    for (const { label, summary } of monthlySummaries) {
      months.push(label);
      rentPayments.push(summary.rentReceived);
      utilityPayments.push(summary.utilityReceived);
      depositPayments.push(summary.depositReceived);
      otherPayments.push(summary.otherReceived);
      walletCreditPayments.push(summary.unappliedCredit);
    }

    const chartData: ChartData = {
      months,
      rentPayments,
      utilityPayments,
      depositPayments,
      otherPayments,
      walletCreditPayments,
    };

    return NextResponse.json({ success: true, chartData });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

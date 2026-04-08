import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  const endMonth = quarter * 3 + 2;
  return new Date(date.getFullYear(), endMonth + 1, 0);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const quarterEnd = endOfQuarter(now).toISOString();

  const guestIdsVerified = await db.collection("airbnbGuestVerifications").countDocuments({
    ownerId,
    status: "verified",
    createdAt: { $gte: monthStart },
  });

  const guestIdsPending = await db.collection("airbnbGuestVerifications").countDocuments({
    ownerId,
    status: "pending",
  });

  const safetyDueThisQuarter = await db.collection("airbnbSafetyChecks").countDocuments({
    ownerId,
    status: { $ne: "completed" },
    dueDate: { $lte: quarterEnd },
  });

  return NextResponse.json({
    success: true,
    guestIdsVerified,
    guestIdsPending,
    safetyDueThisQuarter,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { generateAirbnbInvoicesForOwner } from "@/cron/check-expired-invoices/route";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  if (!ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const stats = await generateAirbnbInvoicesForOwner({ db, ownerId, now: new Date() });

    return NextResponse.json({
      success: true,
      message: "Airbnb invoices refreshed",
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to refresh Airbnb invoices:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to refresh Airbnb invoices",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { AIRBNB_SOFTWARE_LEASING_PERCENT, computeAirbnbListingRevenue } from "@/lib/airbnb-billing";
import { getBillingMonth, roundCurrency } from "@/lib/billing";
import { getMonthRange } from "@/lib/airbnb-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const targetDate = new Date();
  const { start, end } = getMonthRange(targetDate);
  const periodLabel = targetDate.toLocaleString("default", { month: "long", year: "numeric" });
  const billingMonth = getBillingMonth(targetDate);

  const listingRevenues = await computeAirbnbListingRevenue(db, ownerId, start, end);
  const items = listingRevenues.map((listing) => ({
    propertyId: listing.listingId,
    propertyName: listing.listingName,
    billingPlan: "Airbnb",
    percentage: AIRBNB_SOFTWARE_LEASING_PERCENT,
    expectedIncome: roundCurrency(listing.revenue),
    estimatedAmount: roundCurrency((listing.revenue * AIRBNB_SOFTWARE_LEASING_PERCENT) / 100),
  }));
  const total = roundCurrency(items.reduce((sum, item) => sum + (item.estimatedAmount || 0), 0));

  return NextResponse.json({
    success: true,
    period: { billingMonth, label: periodLabel },
    total,
    items,
  });
}

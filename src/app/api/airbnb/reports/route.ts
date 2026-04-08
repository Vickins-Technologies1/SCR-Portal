import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { ensureAirbnbSeed } from "@/lib/airbnb-seed";
import { calculateAdr, calculateOccupancyRate, calculateRevpar } from "@/lib/airbnb-metrics";
import { getMonthRange, parseDate } from "@/lib/airbnb-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  await ensureAirbnbSeed(db, ownerId);

  const { start, end, days } = getMonthRange();

  const bookings = await db
    .collection("airbnbBookings")
    .find({ ownerId, status: { $ne: "cancelled" } })
    .toArray();

  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();

  const monthlyBookings = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && checkIn >= start && checkIn <= end;
  });

  const revenue = monthlyBookings.reduce((sum, booking) => sum + Number(booking.total || 0), 0);
  const bookedNights = monthlyBookings.reduce((sum, booking) => sum + Number(booking.nights || 0), 0);
  const availableNights = listings.reduce((sum, listing) => sum + (listing.units || 1) * days, 0);

  const cancellations = bookings.filter((booking) => booking.status === "cancelled").length;
  const cancellationRate = bookings.length > 0 ? Number(((cancellations / bookings.length) * 100).toFixed(1)) : 0;

  const weightedReviewTotal = listings.reduce(
    (sum, listing) => sum + (listing.rating || 0) * (listing.reviewCount || 0),
    0
  );
  const totalReviews = listings.reduce((sum, listing) => sum + (listing.reviewCount || 0), 0);
  const reviewScore = totalReviews > 0 ? Number((weightedReviewTotal / totalReviews).toFixed(2)) : 0;

  const summary = {
    occupancyRate: calculateOccupancyRate(bookedNights, availableNights),
    revenue: Math.round(revenue),
    adr: calculateAdr(revenue, bookedNights),
    revpar: calculateRevpar(revenue, availableNights),
    cancellationRate,
    reviewScore,
  };

  return NextResponse.json({ success: true, summary });
}

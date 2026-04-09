import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { calculateAdr, calculateOccupancyRate, calculateRevpar } from "@/lib/airbnb-metrics";
import { endOfDay, getMonthRange, parseDate, startOfDay } from "@/lib/airbnb-utils";
import { calculateAirbnbTaxes } from "@/lib/airbnb-taxes";
import { getMonthBuckets, sumAirbnbRevenueForRange } from "@/lib/airbnb-billing";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  const isValidDate = (value?: string | null) => {
    if (!value) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
  };

  let start = getMonthRange().start;
  let end = getMonthRange().end;

  if (isValidDate(startDateParam)) {
    start = startOfDay(new Date(startDateParam!));
  }
  if (isValidDate(endDateParam)) {
    end = endOfDay(new Date(endDateParam!));
  }
  if (start > end) {
    const fallback = getMonthRange();
    start = fallback.start;
    end = fallback.end;
  }

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime() + 1) / (1000 * 60 * 60 * 24)));

  const bookings = await db
    .collection("airbnbBookings")
    .find({ ownerId })
    .toArray();
  const directPayments = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect", status: "completed" })
    .toArray();
  const payouts = await db
    .collection("airbnbPayouts")
    .find({ ownerId, status: "paid" })
    .toArray();

  const revenueSources = {
    directPayments: directPayments.map((payment: any) => ({
      paymentDate: payment.paymentDate,
      createdAt: payment.createdAt,
      amount: payment.amount,
    })),
    payouts: payouts.map((payout: any) => ({
      createdAt: payout.createdAt,
      period: payout.period,
      amount: payout.amount,
    })),
  };

  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();

  const monthlyBookings = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && checkIn >= start && checkIn <= end && booking.status !== "cancelled";
  });

  const revenueBreakdown = sumAirbnbRevenueForRange(revenueSources, start, end);
  const revenue = revenueBreakdown.total;
  const bookedNights = monthlyBookings.reduce((sum, booking) => sum + Number(booking.nights || 0), 0);
  const availableNights = listings.reduce((sum, listing) => sum + (listing.units || 1) * days, 0);

  const inRangeBookings = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && checkIn >= start && checkIn <= end;
  });
  const cancellations = inRangeBookings.filter((booking) => booking.status === "cancelled").length;
  const cancellationRate = inRangeBookings.length > 0 ? Number(((cancellations / inRangeBookings.length) * 100).toFixed(1)) : 0;

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

  const taxes = calculateAirbnbTaxes(summary.revenue);
  const trendBuckets = getMonthBuckets(start, end);
  const trend = trendBuckets.map((bucket) => {
    const bucketStart = bucket.start < start ? start : bucket.start;
    const bucketEnd = bucket.end > end ? end : bucket.end;
    const revenueForMonth = sumAirbnbRevenueForRange(revenueSources, bucketStart, bucketEnd);
    return {
      label: bucket.label,
      total: Math.round(revenueForMonth.total),
      direct: Math.round(revenueForMonth.direct),
      payouts: Math.round(revenueForMonth.payouts),
    };
  });

  return NextResponse.json({
    success: true,
    summary,
    taxes,
    trend,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });
}

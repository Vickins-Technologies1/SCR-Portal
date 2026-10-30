import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { calculateAdr, calculateOccupancyRate, calculateRevpar } from "@/lib/airbnb-metrics";
import { endOfDay, getMonthRange, parseDate, startOfDay } from "@/lib/airbnb-utils";
import { calculateAirbnbTaxes } from "@/lib/airbnb-taxes";
import { sumAirbnbRevenueForRange } from "@/lib/airbnb-billing";
import { ObjectId } from "mongodb";
import { generateAirbnbTaxReportPdf } from "@/lib/airbnb-tax-report-pdf";

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
    .find({ ownerId, status: { $ne: "cancelled" } })
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
    return checkIn && checkIn >= start && checkIn <= end;
  });

  const revenueBreakdown = sumAirbnbRevenueForRange(revenueSources, start, end);
  const revenue = revenueBreakdown.total;
  const bookedNights = monthlyBookings.reduce((sum, booking) => sum + Number(booking.nights || 0), 0);
  const availableNights = listings.reduce((sum, listing) => sum + (listing.units || 1) * days, 0);

  const summary = {
    occupancyRate: calculateOccupancyRate(bookedNights, availableNights),
    revenue: Math.round(revenue),
    adr: calculateAdr(revenue, bookedNights),
    revpar: calculateRevpar(revenue, availableNights),
  };

  const taxes = calculateAirbnbTaxes(summary.revenue);

  const owner = ObjectId.isValid(ownerId)
    ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) })
    : null;

  const pdfBytes = await generateAirbnbTaxReportPdf({ start, end, ownerName: owner?.name || "Property Owner", summary, taxes });
  return NextResponse.json({
    success: true,
    pdf: Buffer.from(pdfBytes).toString("base64"),
    filename: `airbnb-tax-report-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.pdf`,
  });
}

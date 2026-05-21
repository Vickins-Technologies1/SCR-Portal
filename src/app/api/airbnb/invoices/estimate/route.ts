import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { AIRBNB_BOOKING_INVOICE_PERCENT } from "@/lib/airbnb-billing";
import { getBillingMonth, roundCurrency } from "@/lib/billing";
import { parseDate, startOfDay } from "@/lib/airbnb-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const now = new Date();
  const billingMonth = getBillingMonth(now);

  const addMonthlyAnniversary = (base: Date, monthsToAdd: number): Date => {
    const desiredDay = base.getDate();
    const desiredHour = base.getHours();
    const desiredMinute = base.getMinutes();
    const desiredSecond = base.getSeconds();
    const desiredMs = base.getMilliseconds();

    const nextMonth = new Date(base.getFullYear(), base.getMonth() + monthsToAdd, 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    const day = Math.min(desiredDay, lastDay);

    return new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      day,
      desiredHour,
      desiredMinute,
      desiredSecond,
      desiredMs
    );
  };

  const monthDiff = (from: Date, to: Date) =>
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

  const toMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const fmtRange = (start: Date, end: Date) => {
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  };

  const listings = await db
    .collection("airbnbListings")
    .find({ ownerId })
    .project({ externalId: 1, name: 1, createdAt: 1, updatedAt: 1 })
    .toArray();

  const items = [];

  for (const listing of listings as any[]) {
    const listingId = String(listing.externalId || listing._id?.toString?.() || "").trim();
    if (!listingId) continue;

    const listingName = String(listing.name || "Airbnb Listing");
    const listingCreatedAt =
      parseDate(listing.createdAt || null) ||
      parseDate(listing.updatedAt || null);
    if (!listingCreatedAt) continue;
    const listingAnchor = startOfDay(listingCreatedAt);

    let idx = monthDiff(toMonthStart(listingAnchor), toMonthStart(now));
    if (idx < 0) idx = 0;

    let cycleStart = addMonthlyAnniversary(listingAnchor, idx);
    if (cycleStart > now && idx > 0) {
      idx -= 1;
      cycleStart = addMonthlyAnniversary(listingAnchor, idx);
    }
    const cycleEnd = addMonthlyAnniversary(listingAnchor, idx + 1);

    const cycleStartIso = cycleStart.toISOString();
    const cycleNowIso = now.toISOString();

    const [bookingAgg] = await db
      .collection("airbnbBookings")
      .aggregate<{ total: number }>([
        {
          $match: {
            ownerId,
            status: { $ne: "cancelled" },
            $or: [{ listingId }, { listingExternalId: listingId }],
            checkIn: { $gte: cycleStartIso, $lt: cycleNowIso },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: "$total" } },
          },
        },
      ])
      .toArray();

    const bookingTotal = roundCurrency(Number(bookingAgg?.total || 0));
    const estimatedAmount = roundCurrency((bookingTotal * AIRBNB_BOOKING_INVOICE_PERCENT) / 100);

    items.push({
      propertyId: listingId,
      propertyName: listingName,
      billingPlan: "Airbnb",
      percentage: AIRBNB_BOOKING_INVOICE_PERCENT,
      expectedIncome: bookingTotal,
      estimatedAmount,
      period: {
        start: cycleStart.toISOString(),
        end: cycleEnd.toISOString(),
        label: fmtRange(cycleStart, cycleEnd),
      },
    });
  }

  const total = roundCurrency(items.reduce((sum: number, item: any) => sum + Number(item.estimatedAmount || 0), 0));

  return NextResponse.json({
    success: true,
    period: { billingMonth, label: "Upcoming billing periods (varies by listing)" },
    total,
    items,
  });
}

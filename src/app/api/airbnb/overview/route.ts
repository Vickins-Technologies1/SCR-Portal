import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { calculateAdr, calculateOccupancyRate, calculateRevpar } from "@/lib/airbnb-metrics";
import { addDays, getMonthRange, isSameDay, parseDate, toIso } from "@/lib/airbnb-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const bookings = await db
    .collection("airbnbBookings")
    .find({ ownerId })
    .toArray();
  const conversations = await db.collection("airbnbConversations").find({ ownerId }).toArray();
  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();
  const compliance = await db.collection("airbnbCompliance").find({ ownerId }).toArray();
  const calendar = await db
    .collection("airbnbCalendar")
    .find({ ownerId })
    .sort({ date: 1 })
    .toArray();

  const today = new Date();
  const { start, end, days } = getMonthRange(today);

  const todayCheckIns = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && isSameDay(checkIn, today) && booking.status !== "cancelled";
  }).length;

  const todayCheckOuts = bookings.filter((booking) => {
    const checkOut = parseDate(booking.checkOut);
    return checkOut && isSameDay(checkOut, today) && booking.status !== "cancelled";
  }).length;

  const upcomingBookings = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && checkIn > today && booking.status !== "cancelled";
  }).length;

  const unreadMessages = conversations.reduce((sum, convo) => sum + Number(convo.unread || 0), 0);

  const monthlyBookings = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && checkIn >= start && checkIn <= end && booking.status !== "cancelled";
  });

  const monthlyRevenue = monthlyBookings.reduce((sum, booking) => sum + Number(booking.total || 0), 0);
  const bookedNights = monthlyBookings.reduce((sum, booking) => sum + Number(booking.nights || 0), 0);
  const availableNights = listings.reduce((sum, listing) => sum + (listing.units || 1) * days, 0);

  const calendarPreview = calendar
    .filter((night) => {
      const date = parseDate(night.date);
      return date && date >= today && date <= addDays(today, 6);
    })
    .slice(0, 7)
    .map((night) => ({
      date: night.date,
      status: night.status,
      rate: night.rate || 0,
      note: night.note,
    }));

  const recentActivity = [
    ...bookings.map((booking) => ({
      id: booking.externalId || booking._id?.toString?.(),
      type: "booking",
      title: booking.status === "cancelled" ? "Booking cancelled" : "New booking",
      description: `${booking.guestName} • ${booking.listingName}`,
      createdAt: booking.updatedAt || booking.createdAt,
    })),
    ...conversations.map((convo) => ({
      id: convo.externalId || convo._id?.toString?.(),
      type: "message",
      title: "Guest message",
      description: `${convo.guestName} • ${convo.listingName}`,
      createdAt: convo.lastMessageAt,
    })),
  ]
    .filter((item) => item.createdAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  const overview = {
    stats: {
      todayCheckIns,
      todayCheckOuts,
      upcomingBookings,
      unreadMessages,
      monthlyRevenue: Math.round(monthlyRevenue),
      occupancyRate: calculateOccupancyRate(bookedNights, availableNights),
      adr: calculateAdr(monthlyRevenue, bookedNights),
      revpar: calculateRevpar(monthlyRevenue, availableNights),
    },
    calendarPreview: calendarPreview.length
      ? calendarPreview
      : Array.from({ length: 7 }).map((_, index) => ({
          date: toIso(addDays(today, index)),
          status: "available",
          rate: listings[0]?.baseRate || 0,
        })),
    recentActivity,
    compliance: compliance.map((item) => ({
      propertyId: item.externalId || item._id?.toString?.() || "",
      propertyName: item.propertyName,
      ktraLicense: item.ktraLicense,
      ktraExpiry: item.ktraExpiry,
      countyPermitExpiry: item.countyPermitExpiry,
      nemaExpiry: item.nemaExpiry,
      status: item.status,
      nextAction: item.nextAction,
    })),
  };

  return NextResponse.json({ success: true, overview });
}

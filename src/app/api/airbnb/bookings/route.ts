import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { diffNights, parseDate } from "@/lib/airbnb-utils";
import { sendAirbnbBookingConfirmationEmail } from "@/lib/email";

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
    .sort({ checkIn: 1 })
    .toArray();

  return NextResponse.json({
    success: true,
    bookings: bookings.map((booking) => ({
      id: booking.externalId || booking._id?.toString?.() || "",
      listingName: booking.listingName,
      guestName: booking.guestName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      total: booking.total,
      status: booking.status,
      source: booking.source,
      payoutStatus: booking.payoutStatus,
      specialRequests: booking.specialRequests,
    })),
  });
}

const DirectBookingSchema = z.object({
  listingId: z.string().trim().min(1),
  guestName: z.string().trim().min(2),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().trim().optional(),
  checkIn: z.string().trim().min(1),
  checkOut: z.string().trim().min(1),
  total: z.preprocess((value) => Number(value), z.number().nonnegative()),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = DirectBookingSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const listing = await db.collection("airbnbListings").findOne({
    ownerId,
    externalId: parsed.data.listingId,
  });

  if (!listing) {
    return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
  }

  const checkInDate = parseDate(parsed.data.checkIn) || new Date();
  const checkOutDate = parseDate(parsed.data.checkOut) || new Date(checkInDate.getTime() + 86400000);

  if (checkOutDate <= checkInDate) {
    return NextResponse.json(
      { success: false, message: "Check-out must be after check-in." },
      { status: 400 }
    );
  }

  const booking = {
    _id: new ObjectId(),
    ownerId,
    externalId: `dir-${new ObjectId().toString()}`,
    listingId: parsed.data.listingId,
    listingName: listing.name,
    guestName: parsed.data.guestName,
    guestEmail: parsed.data.guestEmail,
    guestPhone: parsed.data.guestPhone,
    checkIn: checkInDate.toISOString(),
    checkOut: checkOutDate.toISOString(),
    nights: diffNights(checkInDate, checkOutDate),
    total: parsed.data.total,
    status: "pending",
    source: "Direct",
    payoutStatus: "pending",
    checkInReminderSent: false,
    checkOutReminderSent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.collection("airbnbBookings").insertOne(booking);

  const settings = await db.collection("airbnbSettings").findOne({ ownerId });
  const shouldSendConfirmation = settings?.sendBookingConfirmation !== false;

  if (parsed.data.guestEmail && shouldSendConfirmation) {
    try {
      await sendAirbnbBookingConfirmationEmail({
        to: parsed.data.guestEmail,
        guestName: booking.guestName,
        listingName: booking.listingName,
        checkIn: new Date(booking.checkIn).toLocaleDateString("en-KE", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        checkOut: new Date(booking.checkOut).toLocaleDateString("en-KE", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        nights: booking.nights,
        total: booking.total,
        supportEmail: settings?.supportEmail,
      });
    } catch (error) {
      console.error("Failed to send Airbnb booking confirmation email", {
        message: error instanceof Error ? error.message : String(error),
        bookingId: booking.externalId,
      });
    }
  }

  return NextResponse.json({
    success: true,
    booking: {
      id: booking.externalId,
      listingName: booking.listingName,
      guestName: booking.guestName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      total: booking.total,
      status: booking.status,
      source: booking.source,
      payoutStatus: booking.payoutStatus,
    },
  });
}

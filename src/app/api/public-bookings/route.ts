import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { diffNights, parseDate } from "@/lib/airbnb-utils";
import { sendAirbnbBookingConfirmationEmail } from "@/lib/email";

const GuestCountSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return Number(value);
  },
  z.number().int().min(1).max(20)
);

const PublicBookingSchema = z.object({
  listingId: z.string().trim().min(1),
  guestName: z.string().trim().min(2),
  guestEmail: z.string().email(),
  guestPhone: z.string().trim().optional(),
  checkIn: z.string().trim().min(1),
  checkOut: z.string().trim().min(1),
  guests: GuestCountSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = PublicBookingSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid booking request" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const listingId = parsed.data.listingId;
  let listing = null;

  if (ObjectId.isValid(listingId)) {
    listing = await db.collection("airbnbListings").findOne({
      _id: new ObjectId(listingId),
      status: { $in: ["published", "active"] },
    });
  }

  if (!listing) {
    listing = await db.collection("airbnbListings").findOne({
      externalId: listingId,
      status: { $in: ["published", "active"] },
    });
  }

  if (!listing) {
    return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
  }

  const checkInDate = parseDate(parsed.data.checkIn);
  const checkOutDate = parseDate(parsed.data.checkOut);

  if (!checkInDate || !checkOutDate) {
    return NextResponse.json({ success: false, message: "Invalid dates provided" }, { status: 400 });
  }

  if (checkOutDate <= checkInDate) {
    return NextResponse.json(
      { success: false, message: "Check-out must be after check-in." },
      { status: 400 }
    );
  }

  const ownerId = listing.ownerId ? String(listing.ownerId) : "";
  if (!ownerId) {
    return NextResponse.json({ success: false, message: "Owner not available" }, { status: 404 });
  }

  const nights = diffNights(checkInDate, checkOutDate);
  const nightlyRate = Number(listing.baseRate || 0);
  const total = Math.max(0, nightlyRate * nights);

  const specialRequestsParts: string[] = [];
  if (parsed.data.guests) {
    specialRequestsParts.push(`Guests: ${parsed.data.guests}`);
  }
  if (parsed.data.notes) {
    specialRequestsParts.push(`Notes: ${parsed.data.notes}`);
  }

  const now = new Date().toISOString();
  const booking = {
    _id: new ObjectId(),
    ownerId,
    externalId: `web-${new ObjectId().toString()}`,
    listingId: listing.externalId || listing._id?.toString?.() || listingId,
    listingName: listing.name || "Airbnb Listing",
    guestName: parsed.data.guestName,
    guestEmail: parsed.data.guestEmail,
    guestPhone: parsed.data.guestPhone?.trim() || undefined,
    checkIn: checkInDate.toISOString(),
    checkOut: checkOutDate.toISOString(),
    nights,
    total,
    amountPaid: 0,
    status: "pending",
    source: "Direct",
    payoutStatus: "pending",
    specialRequests: specialRequestsParts.length ? specialRequestsParts.join(" | ") : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("airbnbBookings").insertOne(booking);

  const checkInLabel = checkInDate.toLocaleDateString("en-KE", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const checkOutLabel = checkOutDate.toLocaleDateString("en-KE", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const guestMessageLines = [
    `New booking request for ${listing.name || "Airbnb Listing"}.`,
    `Check-in: ${checkInLabel}`,
    `Check-out: ${checkOutLabel}`,
    parsed.data.guests ? `Guests: ${parsed.data.guests}` : null,
    parsed.data.notes ? `Message: ${parsed.data.notes}` : null,
    `Guest email: ${parsed.data.guestEmail}`,
    parsed.data.guestPhone ? `Guest phone: ${parsed.data.guestPhone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const messageSummary = parsed.data.notes
    ? parsed.data.notes
    : `Booking request · ${checkInLabel} → ${checkOutLabel}`;

  const existingConversation = await db.collection("airbnbConversations").findOne(
    parsed.data.guestEmail
      ? { ownerId, listingName: listing.name, guestEmail: parsed.data.guestEmail }
      : { ownerId, listingName: listing.name, guestName: parsed.data.guestName }
  );

  let conversationId = "";

  if (existingConversation) {
    conversationId =
      existingConversation.externalId || existingConversation._id?.toString?.() || "";
    await db.collection("airbnbConversations").updateOne(
      { _id: existingConversation._id },
      {
        $set: {
          lastMessage: messageSummary,
          lastMessageAt: now,
          channel: "In-app",
          guestEmail: parsed.data.guestEmail,
          guestPhone: parsed.data.guestPhone?.trim() || existingConversation.guestPhone,
          updatedAt: now,
        },
        $inc: { unread: 1 },
      }
    );
  } else {
    const conversationObjectId = new ObjectId();
    const externalId = `convo-${conversationObjectId.toString()}`;
    conversationId = externalId;
    await db.collection("airbnbConversations").insertOne({
      _id: conversationObjectId,
      ownerId,
      externalId,
      guestName: parsed.data.guestName,
      listingName: listing.name || "Airbnb Listing",
      lastMessage: messageSummary,
      unread: 1,
      channel: "In-app",
      guestEmail: parsed.data.guestEmail,
      guestPhone: parsed.data.guestPhone?.trim() || undefined,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (conversationId) {
    await db.collection("airbnbConversationMessages").insertOne({
      ownerId,
      conversationId,
      message: guestMessageLines,
      sender: "guest",
      createdAt: now,
    });
  }

  const settings = await db.collection("airbnbSettings").findOne({ ownerId });
  const shouldSendConfirmation = settings?.sendBookingConfirmation !== false;

  if (parsed.data.guestEmail && shouldSendConfirmation) {
    try {
      await sendAirbnbBookingConfirmationEmail({
        to: parsed.data.guestEmail,
        guestName: booking.guestName,
        listingName: booking.listingName,
        checkIn: checkInLabel,
        checkOut: checkOutLabel,
        nights,
        total,
        supportEmail: settings?.supportEmail,
      });
    } catch (error) {
      console.error("Failed to send booking confirmation email", {
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

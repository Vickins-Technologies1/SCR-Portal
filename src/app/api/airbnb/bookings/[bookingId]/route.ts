import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  if (!bookingId) {
    return NextResponse.json({ success: false, message: "Missing booking ID" }, { status: 400 });
  }

  const { db } = await connectToDatabase();

  const filters: Record<string, unknown>[] = [{ externalId: bookingId }];
  if (ObjectId.isValid(bookingId)) {
    filters.push({ _id: new ObjectId(bookingId) });
  }

  const booking = await db.collection("airbnbBookings").findOne({ ownerId, $or: filters });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const id = booking.externalId || booking._id?.toString?.() || bookingId;
  const tenant = await db.collection("tenants").findOne(
    { ownerId, accountType: "airbnb_guest", airbnbBookingId: id },
    { projection: { _id: 1 } }
  );

  return NextResponse.json({
    success: true,
    booking: {
      id,
      listingName: booking.listingName,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      tenantId: tenant?._id?.toString?.() || null,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      total: booking.total,
      status: booking.status,
      source: booking.source,
      payoutStatus: booking.payoutStatus,
      specialRequests: booking.specialRequests,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    },
  });
}


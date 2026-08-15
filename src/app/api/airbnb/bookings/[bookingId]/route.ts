import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { resolveAirbnbBookingReference, resolveAirbnbPaymentMethod } from "@/lib/airbnb-booking-workflow";

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
  const amountPaid = Number(booking.amountPaid || 0);
  const total = Number(booking.total || 0);
  const latestPayment = await db.collection("payments").findOne(
    { ownerId, airbnbBookingId: id },
    { sort: { paymentDate: -1, createdAt: -1 } }
  );
  const tenant = await db.collection("tenants").findOne(
    { ownerId, accountType: "airbnb_guest", airbnbBookingId: id },
    { projection: { _id: 1 } }
  );
  const docsCount = await db
    .collection("airbnbGuestDocuments")
    .countDocuments({ ownerId, bookingId: id }, { limit: 1 });

  return NextResponse.json({
    success: true,
    booking: {
      id,
      listingName: booking.listingName,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      guestIdNumber: booking.guestIdNumber,
      guestCount: booking.guestCount ?? null,
      tenantId: tenant?._id?.toString?.() || null,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      total,
      amountPaid,
      amountDue: Math.max(0, total - amountPaid),
      status: booking.status,
      source: booking.source,
      payoutStatus: booking.payoutStatus,
      reference: resolveAirbnbBookingReference(booking),
      paymentMethod: resolveAirbnbPaymentMethod(latestPayment as any),
      mpesaCode: latestPayment?.mpesaCode || latestPayment?.reference || null,
      paymentDate: latestPayment?.paymentDate || null,
      verifiedBy: latestPayment?.verifiedBy || null,
      verificationTimestamp: latestPayment?.verificationTimestamp || null,
      confirmedAt: booking.confirmedAt || booking.confirmationTimestamp || null,
      verificationStatus: docsCount > 0 ? "documents_uploaded" : "documents_missing",
      specialRequests: booking.specialRequests,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    },
  });
}

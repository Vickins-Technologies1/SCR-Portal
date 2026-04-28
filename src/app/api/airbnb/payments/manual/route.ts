import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import {
  buildAirbnbPaymentReference,
  syncAirbnbBookingPaymentStatus,
} from "@/lib/airbnb-payments";
import { diffNights, parseDate } from "@/lib/airbnb-utils";
import { ensureAirbnbGuestPortalAccount } from "@/lib/airbnb-guest-portal";

const ManualPaymentSchema = z.object({
  bookingId: z.string().trim().min(1),
  amount: z.preprocess((value) => (value == null ? undefined : Number(value)), z.number().positive().optional()),
  method: z.enum(["cash"]).default("cash"),
  note: z.string().trim().max(280).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId, userId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ManualPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { bookingId, method, note } = parsed.data;
  const { db } = await connectToDatabase();

  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  try {
    await ensureAirbnbGuestPortalAccount(db, {
      ownerId,
      booking: {
        externalId: bookingId,
        listingId: booking.listingId,
        listingExternalId: booking.listingExternalId,
        listingName: booking.listingName,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        guestPhone: booking.guestPhone,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        total: booking.total,
      },
      deliveryMethod: "both",
      forceResetPassword: false,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to create guest portal account." },
      { status: 400 }
    );
  }

  if (String(booking.payoutStatus || "").toLowerCase() === "paid") {
    return NextResponse.json({ success: false, message: "Booking is already marked as paid." }, { status: 400 });
  }

  const amount = parsed.data.amount ?? Number(booking.total || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: "Invalid amount" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const reference = buildAirbnbPaymentReference(bookingId);
  const transactionId = `CASH-${bookingId}-${Date.now()}`;

  await db.collection("payments").insertOne({
    tenantId: null,
    ownerId,
    amount,
    propertyId: booking.listingId,
    propertyName: booking.listingName,
    paymentDate: nowIso,
    transactionId,
    status: "completed",
    createdAt: nowIso,
    type: "AirbnbDirect",
    phoneNumber: booking.guestPhone || null,
    reference,
    mpesaCode: method === "cash" ? "CASH" : null,
    airbnbBookingId: bookingId,
    provider: "cash",
    recordedByUserId: userId,
    note: note || undefined,
  });

  const sync = await syncAirbnbBookingPaymentStatus(db, { ownerId, bookingId, nowIso });
  if (sync?.payoutStatus === "paid") {
    const pendingExtension = await db
      .collection("airbnbStayExtensions")
      .findOne({ ownerId, bookingId, status: "pending_payment" }, { sort: { createdAt: -1, _id: -1 } });

    if (pendingExtension?.requestedCheckOut) {
      const bookingDoc = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
      const checkIn = parseDate(bookingDoc?.checkIn) || new Date();
      const requestedCheckOut = parseDate(pendingExtension.requestedCheckOut);

      if (requestedCheckOut && bookingDoc) {
        const nights = diffNights(checkIn, requestedCheckOut);
        await db.collection("airbnbBookings").updateOne(
          { ownerId, externalId: bookingId },
          { $set: { checkOut: requestedCheckOut.toISOString(), nights, updatedAt: nowIso } }
        );

        const extendedExpiresAt = new Date(requestedCheckOut.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await db.collection("tenants").updateMany(
          { ownerId, accountType: "airbnb_guest", airbnbBookingId: bookingId },
          { $set: { leaseEndDate: requestedCheckOut.toISOString(), expiresAt: extendedExpiresAt, status: "active", updatedAt: nowIso } }
        );

        await db.collection("airbnbStayExtensions").updateOne(
          { _id: pendingExtension._id },
          { $set: { status: "active", activatedAt: nowIso, updatedAt: nowIso } }
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    message:
      sync?.payoutStatus === "paid"
        ? "Cash payment recorded and booking marked as paid."
        : `Cash payment recorded. Remaining balance: KES ${Math.max(0, Math.round(sync?.remaining ?? 0)).toLocaleString("en-KE")}.`,
  });
}

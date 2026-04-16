import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { buildAirbnbPaymentReference } from "@/lib/airbnb-payments";

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

  await db.collection("airbnbBookings").updateOne(
    { ownerId, externalId: bookingId },
    { $set: { payoutStatus: "paid", updatedAt: nowIso } }
  );

  return NextResponse.json({
    success: true,
    message: "Cash payment recorded and booking marked as paid.",
  });
}


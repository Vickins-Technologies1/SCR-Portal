import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { syncAirbnbBookingPaymentStatus } from "@/lib/airbnb-payments";

const VerifyPaymentSchema = z.object({
  bookingId: z.string().trim().min(1),
  ownerId: z.string().trim().optional(),
  transactionCode: z.string().trim().min(1),
  amount: z.preprocess((value) => (value == null || value === "" ? undefined : Number(value)), z.number().positive().optional()),
  paymentDateTime: z.string().trim().optional(),
  note: z.string().trim().max(280).optional(),
});

function resolveActorLabel(role?: string | null) {
  switch (role) {
    case "admin":
      return "Admin";
    case "adminTeamMember":
      return "Admin Team Member";
    case "propertyOwner":
      return "Property Owner";
    case "teamMember":
      return "Team Member";
    default:
      return "System";
  }
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const role = request.cookies.get("role")?.value || null;
  const userId = request.cookies.get("userId")?.value || null;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = VerifyPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();

  let ownerId = parsed.data.ownerId?.trim() || "";
  let actorLabel = resolveActorLabel(role);
  let actorRole = role || "system";
  let actorUserId = userId || "";

  if (role === "admin" || role === "adminTeamMember") {
    const auth = await requireAdmin(request, "admin:payments:manage");
    if (auth instanceof NextResponse) return auth;
    if (!ownerId) {
      return NextResponse.json({ success: false, message: "ownerId is required for admin verification." }, { status: 400 });
    }
    actorLabel = resolveActorLabel(auth.role);
    actorRole = auth.role;
    actorUserId = auth.userId;
  } else {
    const resolved = await resolveAirbnbOwner(request, ownerId || null);
    if (resolved.response) return resolved.response;
    ownerId = resolved.context!.ownerId;
    actorLabel = resolveActorLabel(resolved.context!.role);
    actorRole = resolved.context!.role;
    actorUserId = resolved.context!.userId;
  }

  if (!ownerId) {
    return NextResponse.json({ success: false, message: "Unable to resolve booking owner." }, { status: 400 });
  }

  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: parsed.data.bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const paymentDate = parsed.data.paymentDateTime ? new Date(parsed.data.paymentDateTime) : new Date();
  const paymentDateIso = Number.isNaN(paymentDate.getTime()) ? nowIso : paymentDate.toISOString();
  const amount = parsed.data.amount ?? Number(booking.total || 0);
  const reference = String(booking.reference || booking.externalId || parsed.data.bookingId);

  const latestPayment = await db.collection("payments").findOne(
    { ownerId, airbnbBookingId: parsed.data.bookingId },
    { sort: { createdAt: -1, paymentDate: -1 } }
  );

  const paymentPatch = {
    tenantId: null,
    ownerId,
    amount,
    propertyId: booking.listingId,
    propertyName: booking.listingName,
    paymentDate: paymentDateIso,
    transactionId: latestPayment?.transactionId || `AIRBNB-${parsed.data.bookingId}-${Date.now()}`,
    status: "completed" as const,
    createdAt: latestPayment?.createdAt || nowIso,
    updatedAt: nowIso,
    type: "AirbnbDirect" as const,
    phoneNumber: booking.guestPhone || null,
    reference,
    mpesaCode: parsed.data.transactionCode,
    airbnbBookingId: parsed.data.bookingId,
    provider: "mpesa" as const,
    paymentMethod: "mpesa",
    verifiedBy: actorLabel,
    verifiedByUserId: actorUserId,
    verifiedByRole: actorRole,
    verificationTimestamp: nowIso,
    verificationSource: "manual",
    note: parsed.data.note || undefined,
  };

  if (latestPayment) {
    await db.collection("payments").updateOne({ _id: latestPayment._id }, { $set: paymentPatch });
  } else {
    await db.collection("payments").insertOne(paymentPatch);
  }

  const sync = await syncAirbnbBookingPaymentStatus(db, { ownerId, bookingId: parsed.data.bookingId, nowIso });
  const refreshedBooking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: parsed.data.bookingId });

  return NextResponse.json({
    success: true,
    message: sync?.payoutStatus === "paid" ? "Payment verified and booking confirmed." : "Payment verified.",
    booking: refreshedBooking
      ? {
          id: refreshedBooking.externalId || parsed.data.bookingId,
          status: refreshedBooking.status,
          payoutStatus: refreshedBooking.payoutStatus,
          reference: refreshedBooking.reference || reference,
        }
      : null,
    payment: {
      transactionCode: parsed.data.transactionCode,
      amount,
      paymentDate: paymentDateIso,
      verifiedBy: actorLabel,
      verificationTimestamp: nowIso,
    },
  });
}

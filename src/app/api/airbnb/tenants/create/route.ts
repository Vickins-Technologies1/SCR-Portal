import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { ensureAirbnbGuestPortalAccount } from "@/lib/airbnb-guest-portal";
import { ObjectId } from "mongodb";

const CreateAirbnbTenantSchema = z.object({
  bookingId: z.string().trim().min(1),
  deliveryMethod: z.enum(["sms", "email", "whatsapp", "both"]).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId, role, userId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = CreateAirbnbTenantSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { bookingId } = parsed.data;
  const deliveryMethod = parsed.data.deliveryMethod || "both";

  const { db }: { db: Db } = await connectToDatabase();

  if (role === "teamMember" && ObjectId.isValid(userId)) {
    const member = await db.collection("teamMembers").findOne({
      _id: new ObjectId(userId),
      active: true,
    });

    if (!member || member.ownerId?.toString?.() !== ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const permissions: string[] = Array.isArray((member as any).permissions) ? (member as any).permissions : [];
    if (!permissions.includes("tenants:edit")) {
      return NextResponse.json(
        { success: false, message: "Insufficient permissions to add tenants" },
        { status: 403 }
      );
    }
  }

  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }
  let tenantId: string;
  let loginUrl: string;

  try {
    const ensured = await ensureAirbnbGuestPortalAccount(db, {
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
      deliveryMethod,
      forceResetPassword: true,
    });
    tenantId = ensured.tenantId;
    loginUrl = ensured.loginUrl;
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to create guest portal account." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    tenantId,
    message: "Guest portal account created and login details sent.",
    links: { loginUrl },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Db, ObjectId } from "mongodb";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { sendWelcomeSms } from "@/lib/sms";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendAirbnbPaymentPortalInviteEmail } from "@/lib/email";
import type { Tenant } from "@/types/tenant";

const CreateAirbnbTenantSchema = z.object({
  bookingId: z.string().trim().min(1),
  deliveryMethod: z.enum(["sms", "email", "whatsapp", "both"]).optional(),
});

function generateTempPassword(): string {
  const raw = crypto.randomBytes(12).toString("base64");
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  return `Pay@${normalized}1`;
}

function resolveBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").trim().replace(/\/$/, "");
}

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

  const parsed = CreateAirbnbTenantSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { bookingId } = parsed.data;
  const deliveryMethod = parsed.data.deliveryMethod || "both";

  const { db }: { db: Db } = await connectToDatabase();

  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const guestEmail = String(booking.guestEmail || "").trim();
  const guestPhone = String(booking.guestPhone || "").trim();

  if (!guestEmail) {
    return NextResponse.json(
      { success: false, message: "Guest email is required to create a payment account." },
      { status: 400 }
    );
  }

  if (!guestPhone) {
    return NextResponse.json(
      { success: false, message: "Guest phone number is required to create a payment account." },
      { status: 400 }
    );
  }

  const password = generateTempPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const checkInIso = String(booking.checkIn || new Date().toISOString());
  const checkOutIso = String(booking.checkOut || new Date().toISOString());
  const expiresAt = (() => {
    const checkout = new Date(checkOutIso);
    if (Number.isNaN(checkout.getTime())) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    const d = new Date(checkout.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString();
  })();

  const baseUrl = resolveBaseUrl();
  const loginUrl = `${baseUrl}/airbnb-tenant-login`;
  const paymentUrl = `${baseUrl}/airbnb-tenant-dashboard`;

  const tenantFilter = {
    ownerId,
    accountType: "airbnb_guest",
    airbnbBookingId: bookingId,
  };

  const now = new Date();
  const existing = await db.collection("tenants").findOne(tenantFilter, { projection: { _id: 1 } });
  let tenantId: string;

  if (existing?._id) {
    await db.collection("tenants").updateOne(
      { _id: existing._id },
      {
        $set: {
          email: guestEmail,
          phone: guestPhone,
          name: booking.guestName || "Guest",
          password: passwordHash,
          expiresAt,
          status: "active",
          updatedAt: now,
          deliveryMethod,
          unitType: "Airbnb Stay",
          unitIdentifier: bookingId,
          propertyId: String(booking.listingId || booking.listingExternalId || booking.listingName || bookingId),
          houseNumber: String(booking.listingName || "Airbnb Stay"),
          leaseStartDate: checkInIso,
          leaseEndDate: checkOutIso,
          price: Number(booking.total || 0),
          deposit: 0,
        },
      }
    );
    tenantId = existing._id.toString();
  } else {
    const tenantData: Tenant = {
      _id: new ObjectId(),
      ownerId,
      name: booking.guestName || "Guest",
      email: guestEmail,
      phone: guestPhone,
      password: passwordHash,
      role: "tenant",
      accountType: "airbnb_guest",
      airbnbBookingId: bookingId,
      expiresAt,
      propertyId: String(booking.listingId || booking.listingExternalId || booking.listingName || bookingId),
      unitType: "Airbnb Stay",
      unitIdentifier: bookingId,
      price: Number(booking.total || 0),
      deposit: 0,
      houseNumber: String(booking.listingName || "Airbnb Stay"),
      leaseStartDate: checkInIso,
      leaseEndDate: checkOutIso,
      status: "active",
      paymentStatus: "current",
      createdAt: now,
      updatedAt: now,
      totalRentPaid: 0,
      totalUtilityPaid: 0,
      totalDepositPaid: 0,
      walletBalance: 0,
      deliveryMethod,
    };

    await db.collection<Tenant>("tenants").insertOne(tenantData);
    tenantId = tenantData._id.toString();
  }

  const amount = Number(booking.total || 0);
  const listingName = String(booking.listingName || "Airbnb Stay");
  const guestName = String(booking.guestName || "Guest");

  const message =
    `Hello ${guestName}!\n` +
    `Your payment portal is ready for ${listingName}.\n` +
    `Booking: ${bookingId}\n` +
    `Amount: KES ${amount.toLocaleString("en-KE")}\n\n` +
    `Login: ${loginUrl}\n` +
    `Email: ${guestEmail}\n` +
    `Password: ${password}\n` +
    `Pay here after login: ${paymentUrl}`;

  const sendEmail = deliveryMethod === "email" || deliveryMethod === "both";
  const sendSms = deliveryMethod === "sms" || deliveryMethod === "both";
  const sendWhatsapp = deliveryMethod === "whatsapp" || deliveryMethod === "both";

  const settings = await db.collection("airbnbSettings").findOne({ ownerId });
  const supportEmail = settings?.supportEmail ? String(settings.supportEmail) : undefined;

  if (sendEmail) {
    try {
      await sendAirbnbPaymentPortalInviteEmail({
        to: guestEmail,
        guestName,
        listingName,
        bookingId,
        amount,
        loginUrl,
        paymentUrl,
        email: guestEmail,
        password,
        supportEmail,
      });
    } catch {
      // ignore
    }
  }

  if (sendSms) {
    try {
      await sendWelcomeSms({ phone: guestPhone, message });
    } catch {
      // ignore
    }
  }

  if (sendWhatsapp) {
    try {
      await sendWhatsAppMessage({ phone: guestPhone, message });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    success: true,
    tenantId,
    message: "Payment account created and login details sent.",
    links: { loginUrl, paymentUrl },
  });
}

import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { sendWelcomeSms } from "@/lib/sms";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendAirbnbPaymentPortalInviteEmail } from "@/lib/email";

export type AirbnbGuestPortalDeliveryMethod = "sms" | "email" | "whatsapp" | "both";

function generateTempPassword(): string {
  const raw = crypto.randomBytes(12).toString("base64");
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  return `Pay@${normalized}1`;
}

function resolveBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").trim().replace(/\/$/, "");
}

export async function ensureAirbnbGuestPortalAccount(
  db: Db,
  params: {
    ownerId: string;
    booking: {
      externalId: string;
      listingId?: string;
      listingExternalId?: string;
      listingName?: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      checkIn?: string;
      checkOut?: string;
      total?: number;
    };
    deliveryMethod?: AirbnbGuestPortalDeliveryMethod;
    forceResetPassword?: boolean;
  }
): Promise<{ tenantId: string; loginUrl: string; email: string; password?: string }> {
  const deliveryMethod = params.deliveryMethod || "both";
  const ownerId = params.ownerId.trim();
  const bookingId = String(params.booking.externalId || "").trim();
  const guestEmail = String(params.booking.guestEmail || "").trim();
  const guestPhone = String(params.booking.guestPhone || "").trim();

  if (!ownerId) throw new Error("Missing ownerId");
  if (!bookingId) throw new Error("Missing bookingId");
  if (!guestEmail) throw new Error("Guest email is required to create a portal account.");
  if (!guestPhone) throw new Error("Guest phone number is required to create a portal account.");

  const baseUrl = resolveBaseUrl();
  const loginUrl = `${baseUrl}/airbnb-tenant-login`;

  const tenantFilter = { ownerId, accountType: "airbnb_guest", airbnbBookingId: bookingId };
  const existing = await db.collection("tenants").findOne(tenantFilter, { projection: { _id: 1 } });

  const shouldResetPassword = params.forceResetPassword || !existing?._id;
  const password = shouldResetPassword ? generateTempPassword() : null;
  const passwordHash = shouldResetPassword && password ? await bcrypt.hash(password, 10) : null;

  const now = new Date();
  const listingName = String(params.booking.listingName || "Airbnb Stay");
  const guestName = String(params.booking.guestName || "Guest");
  const checkInIso = String(params.booking.checkIn || new Date().toISOString());
  const checkOutIso = String(params.booking.checkOut || new Date().toISOString());
  const expiresAt = (() => {
    const checkout = new Date(checkOutIso);
    if (Number.isNaN(checkout.getTime())) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    return new Date(checkout.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  })();

  const update: Record<string, unknown> = {
    email: guestEmail,
    phone: guestPhone,
    name: guestName,
    expiresAt,
    status: "active",
    updatedAt: now,
    deliveryMethod,
    unitType: "Airbnb Stay",
    unitIdentifier: bookingId,
    propertyId: String(params.booking.listingId || params.booking.listingExternalId || params.booking.listingName || bookingId),
    houseNumber: listingName,
    leaseStartDate: checkInIso,
    leaseEndDate: checkOutIso,
    price: Number(params.booking.total || 0),
    deposit: 0,
  };

  if (passwordHash) {
    update.password = passwordHash;
  }

  let tenantId: string;
  if (existing?._id) {
    await db.collection("tenants").updateOne({ _id: existing._id }, { $set: update });
    tenantId = existing._id.toString();
  } else {
    const tenantData = {
      _id: new ObjectId(),
      ownerId,
      name: guestName,
      email: guestEmail,
      phone: guestPhone,
      password: passwordHash || "",
      role: "tenant",
      accountType: "airbnb_guest",
      airbnbBookingId: bookingId,
      expiresAt,
      propertyId: update.propertyId,
      unitType: "Airbnb Stay",
      unitIdentifier: bookingId,
      price: Number(params.booking.total || 0),
      deposit: 0,
      houseNumber: listingName,
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
    await db.collection("tenants").insertOne(tenantData);
    tenantId = tenantData._id.toString();
  }

  if (!password) {
    return { tenantId, loginUrl, email: guestEmail };
  }

  const amount = Number(params.booking.total || 0);
  const message =
    `Hello ${guestName}!\n` +
    `Your guest portal is ready for ${listingName}.\n` +
    `Booking: ${bookingId}\n` +
    `Amount: KES ${amount.toLocaleString("en-KE")}\n\n` +
    `Login: ${loginUrl}\n` +
    `Email: ${guestEmail}\n` +
    `Password: ${password}`;

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
        paymentUrl: `${baseUrl}/airbnb-tenant-dashboard`,
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

  return { tenantId, loginUrl, email: guestEmail, password };
}


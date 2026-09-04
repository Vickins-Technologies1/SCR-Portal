import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildAirbnbPaymentReference, getAirbnbBookingPaymentSummary } from "@/lib/airbnb-payments";
import { resolveLandlordMpesaRouting } from "@/lib/mpesa-routing";
import { resolveTenantContext } from "@/lib/impersonation";
import { resolveAccountTier } from "@/lib/tier";
import {
  resolveAirbnbBookingReference,
  resolveAirbnbOwnerProfile,
  resolveAirbnbPaymentMethod,
} from "@/lib/airbnb-booking-workflow";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const { db } = await connectToDatabase();
  const tenantContext = await resolveTenantContext({
    db,
    userId,
    role,
    isImpersonating,
    impersonatingTenantId,
  });

  if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantContext.tenantId) });
  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  if (tenant.accountType !== "airbnb_guest" || !tenant.airbnbBookingId) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  if (tenant.expiresAt) {
    const expiresAt = new Date(String(tenant.expiresAt));
    if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
      return NextResponse.json({ success: false, message: "This payment account has expired." }, { status: 403 });
    }
  }

  const bookingId = String(tenant.airbnbBookingId);
  const booking = await db.collection("airbnbBookings").findOne({ ownerId: tenant.ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const ownerId = typeof tenant.ownerId === "string" ? tenant.ownerId : tenant.ownerId?.toString?.() || "";
  const ownerProfile = await resolveAirbnbOwnerProfile(db, ownerId);
  const listing = booking.listingId
    ? await db.collection("airbnbListings").findOne({ ownerId, externalId: String(booking.listingId) })
    : null;
  const ownerTier = ObjectId.isValid(ownerId)
    ? resolveAccountTier(
        (
          await db.collection("propertyOwners").findOne(
            { _id: new ObjectId(ownerId), role: "propertyOwner" },
            { projection: { tier: 1 } }
          )
        )?.tier,
        "premium"
      )
    : "premium";
  const canPay = ownerTier === "premium";

  const reference = buildAirbnbPaymentReference(bookingId);
  const { amountPaid } = await getAirbnbBookingPaymentSummary(db, { ownerId: String(tenant.ownerId), bookingId });
  const total = Number(booking.total || 0);
  const remaining = Math.max(0, total - amountPaid);

  let paymentType: "paybill" | "till" | "bank" | "unknown" = "unknown";
  let shortcode = "";
  let paybillAccountNumber = "";
  let passkey = "";

  try {
    const resolved = await resolveLandlordMpesaRouting({
      landlordId: ownerId,
      propertyId: String(booking.listingId || ""),
    });
    paymentType = resolved.paymentType || "unknown";
    shortcode = resolved.shortcode;
    paybillAccountNumber = resolved.paybillAccountNumber || "";
    passkey = resolved.passkey;
  } catch {
    // ignore
  }

  if (!canPay) {
    paymentType = "unknown";
    shortcode = "";
    paybillAccountNumber = "";
    passkey = "";
  }

  const latestPayment = await db.collection("payments").findOne(
    { ownerId: tenant.ownerId, airbnbBookingId: bookingId },
    { sort: { createdAt: -1 } }
  );

  return NextResponse.json({
    success: true,
    ownerTier,
    features: { canPay },
    booking: {
      id: booking.externalId || bookingId,
      listingName: booking.listingName,
      guestName: booking.guestName,
      guestCount: booking.guestCount ?? null,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      reference: resolveAirbnbBookingReference(booking as any),
      total,
      amountPaid,
      amountDue: remaining,
      paymentMethod: resolveAirbnbPaymentMethod(latestPayment as any),
      mpesaCode: latestPayment?.mpesaCode || latestPayment?.reference || null,
      paymentDate: latestPayment?.paymentDate || null,
      verifiedBy: latestPayment?.verifiedBy || null,
      verificationTimestamp: latestPayment?.verificationTimestamp || null,
      confirmedAt: booking.confirmedAt || booking.confirmationTimestamp || null,
      payoutStatus: booking.payoutStatus,
      status: booking.status,
      hostName: ownerProfile.name,
      hostPhone: ownerProfile.phone || listing?.contactPhone || null,
      hostEmail: ownerProfile.email || null,
    },
    paymentRail: {
      paymentType,
      shortcode,
      paybillAccountNumber,
      hasPasskey: Boolean(passkey),
    },
    latestPayment: latestPayment
      ? {
          id: latestPayment._id?.toString?.() || "",
          status: latestPayment.status,
          provider: latestPayment.provider,
          amount: latestPayment.amount,
          paymentDate: latestPayment.paymentDate,
          mpesaCode: latestPayment.mpesaCode,
        }
      : null,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { createTumaStkPush, isTumaConfigured } from "@/lib/tuma";
import { getAirbnbOwnerTumaIntegration } from "@/lib/airbnb-owner-integrations";
import { initiateStkPush, isValidKenyanMsisdn, normalizePhoneNumber } from "@/lib/mpesa";
import { resolveLandlordMpesaRouting } from "@/lib/mpesa-routing";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { buildAirbnbPaymentReference, getAirbnbBookingPaymentSummary } from "@/lib/airbnb-payments";
import { resolveTenantContext } from "@/lib/impersonation";
import { resolveAccountTier } from "@/lib/tier";

const StkSchema = z.object({
  phone: z.string().trim().optional(),
  amount: z.preprocess((value) => (value == null ? undefined : Number(value)), z.number().positive().optional()),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = StkSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

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

  const ownerId = typeof tenant.ownerId === "string" ? tenant.ownerId : tenant.ownerId?.toString?.() || "";
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
  if (ownerTier === "free") {
    return NextResponse.json(
      {
        success: false,
        message:
          "Payments are locked on the Free tier. Ask the property owner to upgrade to Premium to enable guest payments.",
        code: "FREE_TIER_GUEST_PAYMENTS_LOCKED",
      },
      { status: 403 }
    );
  }

  const bookingId = String(tenant.airbnbBookingId);
  const booking = await db.collection("airbnbBookings").findOne({ ownerId: tenant.ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const totalDue = Number(booking.total || 0);
  const { amountPaid } = await getAirbnbBookingPaymentSummary(db, { ownerId: String(tenant.ownerId), bookingId });
  const remaining = Math.max(0, totalDue - amountPaid);
  if (totalDue <= 0 || remaining <= 0) {
    return NextResponse.json({ success: false, message: "Booking is already fully paid." }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone || tenant.phone || "");
  if (!isValidKenyanMsisdn(normalizedPhone)) {
    return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
  }

  const requestedAmount = parsed.data.amount;
  const amount = Math.min(requestedAmount ?? remaining, remaining);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: "Invalid amount" }, { status: 400 });
  }

  const reference = buildAirbnbPaymentReference(bookingId);

  const tumaCallbackBase = (process.env.TUMA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
  const tumaIntegration = await getAirbnbOwnerTumaIntegration(db, String(tenant.ownerId));
  const tumaConfigured = isTumaConfigured(
    tumaIntegration ? { email: tumaIntegration.email, apiKey: tumaIntegration.apiKey } : null
  );
  if (tumaConfigured && !tumaCallbackBase) {
    return NextResponse.json(
      { success: false, message: "Missing TUMA_CALLBACK_BASE_URL for Tuma gateway." },
      { status: 500 }
    );
  }

  const nowIso = new Date().toISOString();

  if (tumaConfigured) {
    const incoming = await createTumaStkPush({
      amount,
      phone: normalizedPhone,
      description: `Airbnb booking ${bookingId}`,
      callbackUrl: `${tumaCallbackBase}/api/tuma/webhook`,
      credentials: {
        email: tumaIntegration!.email,
        apiKey: tumaIntegration!.apiKey,
      },
    });

    const checkoutRequestId = incoming.checkoutRequestId || incoming.merchantRequestId || "";
    const merchantRequestId = incoming.merchantRequestId || "";

    await db.collection("payments").insertOne({
      tenantId: null,
      airbnbTenantId: tenantContext.tenantId,
      ownerId: tenant.ownerId,
      amount,
      propertyId: booking.listingId,
      propertyName: booking.listingName,
      paymentDate: nowIso,
      transactionId: checkoutRequestId || merchantRequestId || reference,
      status: "pending_stk",
      createdAt: nowIso,
      type: "AirbnbDirect",
      phoneNumber: normalizedPhone,
      reference,
      mpesaCode: null,
      checkoutRequestId,
      merchantRequestId,
      airbnbBookingId: bookingId,
      provider: "tuma",
      tumaPaymentId: incoming.raw?.data?.payment_id || incoming.raw?.payment_id || "",
    });

    return NextResponse.json({
      success: true,
      message: incoming.customerMessage || "STK Push initiated. Check your phone.",
      checkoutRequestId,
    });
  }

  const resolvedMpesa = await resolveLandlordMpesaRouting({
    landlordId: String(tenant.ownerId || ""),
    propertyId: String(booking.listingId || ""),
  });

  const paymentType = resolvedMpesa.paymentType || "";
  const paybillAccountNumber = resolvedMpesa.paybillAccountNumber || "";
  const shortcode = resolvedMpesa.shortcode;
  const passkey = resolvedMpesa.passkey;

  const callbackBase = (process.env.MPESA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
  if (!callbackBase) {
    return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
  }

  const resolvedPaymentType =
    paymentType === "till" ? "till" : "paybill";
  const transactionType = resolvedPaymentType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
  const account = resolvedPaymentType === "paybill" && paybillAccountNumber ? paybillAccountNumber : reference;

  const stkResponse = await initiateStkPush({
    shortcode,
    passkey,
    amount,
    phone: normalizedPhone,
    accountReference: account,
    transactionDesc: `Airbnb booking ${bookingId}`,
    callbackUrl: `${callbackBase}/api/mpesa/stk-callback`,
    transactionType,
  });

  if (stkResponse.ResponseCode !== "0") {
    return NextResponse.json(
      { success: false, message: stkResponse.ResponseDescription || "Payment initiation failed" },
      { status: 400 }
    );
  }

  await db.collection("payments").insertOne({
    tenantId: null,
    airbnbTenantId: tenantContext.tenantId,
    ownerId: tenant.ownerId,
    amount,
    propertyId: booking.listingId,
    propertyName: booking.listingName,
    paymentDate: nowIso,
    transactionId: stkResponse.CheckoutRequestID,
    status: "pending",
    createdAt: nowIso,
    type: "AirbnbDirect",
    phoneNumber: normalizedPhone,
    reference,
    mpesaCode: null,
    checkoutRequestId: stkResponse.CheckoutRequestID,
    merchantRequestId: stkResponse.MerchantRequestID,
    airbnbBookingId: bookingId,
    provider: "mpesa",
  });

  return NextResponse.json({
    success: true,
    message: stkResponse.CustomerMessage || "STK Push initiated. Check your phone.",
    checkoutRequestId: stkResponse.CheckoutRequestID,
  });
}

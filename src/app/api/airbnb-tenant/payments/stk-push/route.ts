import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { createTumaStkPush, isTumaConfigured } from "@/lib/tuma";
import { getOwnerTumaIntegration } from "@/lib/owner-integrations";
import {
  decryptPasskey,
  getMpesaPasskey,
  getMpesaShortcode,
  initiateStkPush,
  isValidKenyanMsisdn,
  normalizePhoneNumber,
} from "@/lib/mpesa";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { buildAirbnbPaymentReference } from "@/lib/airbnb-payments";

const StkSchema = z.object({
  phone: z.string().trim().optional(),
  amount: z.preprocess((value) => (value == null ? undefined : Number(value)), z.number().positive().optional()),
});

function resolveStoredPasskey(rawPasskey: string): string {
  if (!rawPasskey) return "";
  try {
    return decryptPasskey(rawPasskey);
  } catch {
    return rawPasskey;
  }
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || role !== "tenant" || !ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

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
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(userId) });
  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  if (tenant.accountType !== "airbnb_guest" || !tenant.airbnbBookingId) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const bookingId = String(tenant.airbnbBookingId);
  const booking = await db.collection("airbnbBookings").findOne({ ownerId: tenant.ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  if (String(booking.payoutStatus || "").toLowerCase() === "paid") {
    return NextResponse.json({ success: false, message: "Booking is already marked as paid." }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone || tenant.phone || "");
  if (!isValidKenyanMsisdn(normalizedPhone)) {
    return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
  }

  const amount = parsed.data.amount ?? Number(booking.total || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: "Invalid amount" }, { status: 400 });
  }

  const reference = buildAirbnbPaymentReference(bookingId);

  const tumaCallbackBase = (process.env.TUMA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
  const tumaIntegration = await getOwnerTumaIntegration(db, String(tenant.ownerId));
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
      airbnbTenantId: userId,
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

  await connectMongoose();
  const mpesaDoc = await LandlordMpesa.findOne({ landlord: tenant.ownerId })
    .select({ paymentType: 1, paybillNumber: 1, paybillAccountNumber: 1, tillNumber: 1, shortcode: 1, passkey: 1 })
    .lean<{
      paymentType?: string;
      paybillNumber?: string;
      paybillAccountNumber?: string;
      tillNumber?: string;
      shortcode?: string;
      passkey?: string;
    }>()
    .exec();

  const paymentType = mpesaDoc?.paymentType || "";
  const paybillNumber = mpesaDoc?.paybillNumber?.trim() || "";
  const paybillAccountNumber = mpesaDoc?.paybillAccountNumber?.trim() || "";
  const tillNumber = mpesaDoc?.tillNumber?.trim() || "";
  const storedShortcode = mpesaDoc?.shortcode?.trim() || "";
  const storedPasskey = mpesaDoc?.passkey?.trim() || "";

  let shortcode = storedShortcode || paybillNumber || tillNumber || "";
  let passkey = resolveStoredPasskey(storedPasskey);

  if (!shortcode) shortcode = getMpesaShortcode();
  if (!passkey) passkey = getMpesaPasskey();

  const callbackBase = (process.env.MPESA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
  if (!callbackBase) {
    return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
  }

  const resolvedPaymentType =
    paymentType === "till" || paymentType === "paybill" || paymentType === "bank"
      ? paymentType
      : tillNumber
        ? "till"
        : paybillNumber
          ? "paybill"
          : "paybill";
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
    airbnbTenantId: userId,
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


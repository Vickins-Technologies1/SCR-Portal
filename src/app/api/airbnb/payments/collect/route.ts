import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { createTumaStkPush, isTumaConfigured } from "@/lib/tuma";
import { getAirbnbOwnerTumaIntegration } from "@/lib/airbnb-owner-integrations";
import {
  decryptPasskey,
  getMpesaPasskey,
  getMpesaShortcode,
  initiateStkPush,
  isValidKenyanMsisdn,
  normalizePhoneNumber,
} from "@/lib/mpesa";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildAirbnbPaymentReference } from "@/lib/airbnb-payments";

const CollectSchema = z.object({
  bookingId: z.string().trim().min(1),
  amount: z.preprocess((value) => Number(value), z.number().positive()),
  phone: z.string().trim().min(7),
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

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = CollectSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { bookingId, amount, phone } = parsed.data;
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!isValidKenyanMsisdn(normalizedPhone)) {
    return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  if (String(booking.payoutStatus || "").toLowerCase() === "paid") {
    return NextResponse.json({ success: false, message: "Booking is already marked as paid." }, { status: 400 });
  }

  await connectMongoose();
  const mpesaDoc = await LandlordMpesa.findOne({ landlord: ownerId })
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

  const nowIso = new Date().toISOString();
  const accountReference = buildAirbnbPaymentReference(bookingId);
  const tumaCallbackBase = (process.env.TUMA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
  const tumaIntegration = await getAirbnbOwnerTumaIntegration(db, ownerId);
  const tumaConfigured = isTumaConfigured(
    tumaIntegration
      ? { email: tumaIntegration.email, apiKey: tumaIntegration.apiKey }
      : null
  );
  if (tumaConfigured && !tumaCallbackBase) {
    return NextResponse.json(
      { success: false, message: "Missing TUMA_CALLBACK_BASE_URL for Tuma gateway." },
      { status: 500 }
    );
  }

  if (tumaConfigured) {
    const description = `Airbnb booking ${bookingId}`;
    const incoming = await createTumaStkPush({
      amount,
      phone: normalizedPhone,
      description,
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
      ownerId,
      amount,
      propertyId: booking.listingId,
      propertyName: booking.listingName,
      paymentDate: nowIso,
      transactionId: checkoutRequestId || merchantRequestId || accountReference,
      status: "pending_stk",
      createdAt: nowIso,
      type: "AirbnbDirect",
      phoneNumber: normalizedPhone,
      reference: accountReference,
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

  let shortcode = storedShortcode || paybillNumber || tillNumber || "";
  let passkey = resolveStoredPasskey(storedPasskey);

  if (!shortcode) shortcode = getMpesaShortcode();
  if (!passkey) passkey = getMpesaPasskey();

  const callbackBase = process.env.MPESA_CALLBACK_BASE_URL || "";
  if (!callbackBase) {
    return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
  }

  const transactionType = paymentType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
  const account = paymentType === "paybill" && paybillAccountNumber ? paybillAccountNumber : accountReference;

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
    ownerId,
    amount,
    propertyId: booking.listingId,
    propertyName: booking.listingName,
    paymentDate: nowIso,
    transactionId: stkResponse.CheckoutRequestID,
    status: "pending",
    createdAt: nowIso,
    type: "AirbnbDirect",
    phoneNumber: normalizedPhone,
    reference: accountReference,
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

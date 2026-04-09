import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { createIncomingPaymentRequest } from "@/lib/kopokopo";
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

function isKopoKopoOnlinePaymentsTill(value: string): boolean {
  const trimmed = (value || "").trim().toUpperCase();
  return /^K\d{5,}$/.test(trimmed);
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

  const kopoClientId = (process.env.KOPOKOPO_CLIENT_ID || "").trim();
  const kopoClientSecret = (process.env.KOPOKOPO_CLIENT_SECRET || "").trim();
  const kopoCallbackBase = (process.env.KOPOKOPO_CALLBACK_BASE_URL || "").trim();
  const kopoTillEnv = (process.env.KOPOKOPO_STK_TILL_NUMBER || "").trim();
  const useKopoKopo = !!(kopoClientId && kopoClientSecret && kopoCallbackBase);

  const kopoTillCandidate = isKopoKopoOnlinePaymentsTill(tillNumber)
    ? tillNumber
    : isKopoKopoOnlinePaymentsTill(kopoTillEnv)
      ? kopoTillEnv
      : "";

  const nowIso = new Date().toISOString();
  const accountReference = buildAirbnbPaymentReference(bookingId);

  if (kopoTillCandidate) {
    if (!useKopoKopo) {
      return NextResponse.json(
        { success: false, message: "Incomplete KopoKopo configuration." },
        { status: 500 }
      );
    }

    const incoming = await createIncomingPaymentRequest({
      tillNumber: kopoTillCandidate,
      firstName: (booking.guestName || "Guest").split(" ")[0],
      lastName: (booking.guestName || "Guest").split(" ").slice(1).join(" ") || "Guest",
      phoneNumber: `+${normalizedPhone}`,
      email: booking.guestEmail || undefined,
      amount,
      metadata: {
        reference: accountReference,
        booking_id: bookingId,
        owner_id: ownerId,
      },
      callbackUrl: `${kopoCallbackBase}/api/kopokopo/incoming-payments`,
    });

    await db.collection("payments").insertOne({
      tenantId: null,
      ownerId,
      amount,
      propertyId: booking.listingId,
      propertyName: booking.listingName,
      paymentDate: nowIso,
      transactionId: incoming.id,
      status: "pending_stk",
      createdAt: nowIso,
      type: "AirbnbDirect",
      phoneNumber: normalizedPhone,
      reference: accountReference,
      mpesaCode: null,
      checkoutRequestId: incoming.id,
      merchantRequestId: incoming.id,
      airbnbBookingId: bookingId,
      provider: "kopokopo",
      kopokopoIncomingPaymentId: incoming.id,
      kopokopoLocation: incoming.location,
    });

    return NextResponse.json({
      success: true,
      message: "STK Push initiated via KopoKopo.",
      checkoutRequestId: incoming.id,
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

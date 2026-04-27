import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import { sendAirbnbPaymentReceivedEmail } from "@/lib/email";
import { deactivateAirbnbGuestTenantsForBooking, syncAirbnbBookingPaymentStatus } from "@/lib/airbnb-payments";

const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_TOLERANCE = Number(process.env.STRIPE_WEBHOOK_TOLERANCE || 300);

function parseStripeSignature(signature: string) {
  const parts = signature.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  return { timestamp, signatures };
}

function verifyStripeSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const { timestamp, signatures } = parseStripeSignature(signature);
  if (!timestamp || signatures.length === 0) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();

  if (!STRIPE_SECRET) {
    return NextResponse.json({ success: false, message: "Stripe webhook secret missing" }, { status: 500 });
  }

  if (!verifyStripeSignature(payload, signature, STRIPE_SECRET)) {
    return NextResponse.json({ success: false, message: "Invalid Stripe signature" }, { status: 400 });
  }

  const { timestamp } = parseStripeSignature(signature || "");
  if (timestamp && STRIPE_TOLERANCE > 0) {
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - Number(timestamp));
    if (Number.isFinite(diff) && diff > STRIPE_TOLERANCE) {
      return NextResponse.json({ success: false, message: "Stale Stripe signature" }, { status: 400 });
    }
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid Stripe payload" }, { status: 400 });
  }

  const eventType = event?.type || "";
  if (!["payment_intent.succeeded", "checkout.session.completed"].includes(eventType)) {
    return NextResponse.json({ received: true });
  }

  const obj = event?.data?.object || {};
  const metadata = obj?.metadata || {};
  const ownerId = metadata.ownerId || metadata.owner_id || null;
  const bookingId = metadata.bookingId || metadata.booking_id || metadata.airbnbBookingId || null;
  const listingId = metadata.listingId || metadata.listing_id || null;
  const propertyName = metadata.propertyName || metadata.listingName || obj?.metadata?.listingName;
  const guestEmail = obj?.receipt_email || obj?.customer_details?.email || metadata.guestEmail || null;
  const guestName = metadata.guestName || metadata.guest_name || "Guest";
  const amountCents = obj?.amount_received ?? obj?.amount_total ?? 0;
  const amount = Math.round(Number(amountCents || 0)) / 100;
  const paymentId = obj?.payment_intent || obj?.id || event?.id;
  const paymentDate = obj?.created ? new Date(obj.created * 1000).toISOString() : new Date().toISOString();

  if (!ownerId || !paymentId) {
    return NextResponse.json({ received: true });
  }

  const { db } = await connectToDatabase();
  const existing = await db.collection("payments").findOne({ transactionId: paymentId });

  if (existing) {
    await db.collection("payments").updateOne(
      { _id: existing._id },
      { $set: { status: "completed", paymentDate } }
    );
  } else {
    await db.collection("payments").insertOne({
      tenantId: null,
      ownerId,
      amount,
      propertyId: listingId || "",
      propertyName: propertyName || "Airbnb Booking",
      paymentDate,
      transactionId: paymentId,
      status: "completed",
      createdAt: new Date().toISOString(),
      type: metadata.paymentType || "AirbnbDirect",
      reference: metadata.reference || paymentId,
      provider: "stripe",
      airbnbBookingId: bookingId || undefined,
    });
  }

  if (bookingId) {
    const nowIso = new Date().toISOString();
    const sync = await syncAirbnbBookingPaymentStatus(db, { ownerId: String(ownerId), bookingId: String(bookingId), nowIso });
    if (sync?.payoutStatus === "paid") {
      await deactivateAirbnbGuestTenantsForBooking(db, { ownerId: String(ownerId), bookingId: String(bookingId), nowIso });
    }
  }

  if (bookingId && guestEmail) {
    const settings = await db.collection("airbnbSettings").findOne({ ownerId });
    if (settings?.sendPaymentReceipt !== false) {
      try {
        await sendAirbnbPaymentReceivedEmail({
          to: guestEmail,
          guestName,
          listingName: propertyName || "Airbnb Stay",
          amount,
          paymentDate: new Date(paymentDate).toLocaleDateString("en-KE", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          reference: paymentId,
          supportEmail: settings?.supportEmail,
        });
      } catch (error) {
        console.error("Failed to send Stripe payment receipt email", {
          bookingId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}

export const runtime = "nodejs";

// src/app/api/kopokopo/incoming-payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { sendAirbnbPaymentReceivedEmail } from "@/lib/email";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function normalizeMsisdn(value?: string): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function isLikelyMpesaReceipt(reference?: string): boolean {
  if (!reference) return false;
  const trimmed = reference.trim();
  return /^[A-Z0-9]{10}$/i.test(trimmed);
}

export async function POST(request: NextRequest) {
  const secret = process.env.KOPOKOPO_CLIENT_SECRET || "";
  const signature = request.headers.get("x-kopokopo-signature");

  const bodyText = await request.text();
  if (secret) {
    if (!signature) {
      logger.error("Missing KopoKopo signature");
      return NextResponse.json({ success: false, message: "Missing signature" }, { status: 401 });
    }
    if (!verifySignature(bodyText, signature, secret)) {
      logger.error("Invalid KopoKopo signature", { signature });
      return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const data = payload?.data;
  const id = data?.id ? String(data.id) : "";
  const attributes = data?.attributes || {};
  const eventResource = attributes?.event?.resource || {};

  const status = String(attributes?.status || "").toLowerCase();
  const resourceStatus = String(eventResource?.status || "").toLowerCase();
  const eventErrors = attributes?.event?.errors;
  const errorsLower = (Array.isArray(eventErrors) ? eventErrors.join("; ") : eventErrors || "")
    .toString()
    .toLowerCase();
  const reference = eventResource?.reference ? String(eventResource.reference) : "";
  const senderPhone = eventResource?.sender_phone_number ? String(eventResource.sender_phone_number) : "";
  const amountValue = eventResource?.amount ? Number(eventResource.amount) : undefined;
  const originationTime = eventResource?.origination_time ? String(eventResource.origination_time) : "";

  if (!id) {
    return NextResponse.json({ success: false, message: "Missing incoming payment id" }, { status: 400 });
  }

  const isCompleted = status === "success" && resourceStatus === "received" && isLikelyMpesaReceipt(reference);
  const isCancelled =
    status === "failed" &&
    (errorsLower.includes("cancel") || errorsLower.includes("canceled") || errorsLower.includes("cancelled"));
  const isFailed =
    status === "failed" ||
    resourceStatus === "failed" ||
    errorsLower.includes("timeout") ||
    errorsLower.includes("expired");
  const normalizedStatus = isCompleted ? "completed" : isCancelled ? "cancelled" : isFailed ? "failed" : "pending";

  try {
    const { db } = await connectToDatabase();
    const payment = await db.collection("payments").findOne({
      $or: [
        { transactionId: id },
        { checkoutRequestId: id },
        { merchantRequestId: id },
        ...(reference ? [{ reference }] : []),
      ],
    });

    if (!payment) {
      logger.error("KopoKopo callback payment not found", { id, reference });
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    const expectedPhone = normalizeMsisdn(payment.phoneNumber);
    const incomingPhone = normalizeMsisdn(senderPhone);
    const hasIncomingPhone = !!incomingPhone;
    const hasAmount = amountValue != null && !Number.isNaN(amountValue);
    const phoneMatches = hasIncomingPhone && (!expectedPhone || incomingPhone === expectedPhone);
    const amountMatches = hasAmount && Number(amountValue) === Number(payment.amount);
    const referenceValid = isLikelyMpesaReceipt(reference);

    const update: Record<string, any> = { status: normalizedStatus };
    if (isCompleted && referenceValid && phoneMatches && amountMatches) {
      update.mpesaCode = reference;
    } else if (isCompleted && (!referenceValid || !phoneMatches || !amountMatches)) {
      update.status = "pending";
    }
    if (originationTime) update.paymentDate = originationTime;

    await db.collection("payments").updateOne({ _id: payment._id }, { $set: update });

    if (payment.airbnbBookingId) {
      await db.collection("airbnbBookings").updateOne(
        { externalId: payment.airbnbBookingId, ownerId: payment.ownerId },
        {
          $set: {
            payoutStatus: normalizedStatus === "completed" ? "paid" : normalizedStatus === "failed" ? "failed" : "pending",
            updatedAt: new Date().toISOString(),
          },
        }
      );

      if (normalizedStatus === "completed") {
        const booking = await db.collection("airbnbBookings").findOne({
          externalId: payment.airbnbBookingId,
          ownerId: payment.ownerId,
        });
        const settings = await db.collection("airbnbSettings").findOne({ ownerId: payment.ownerId });
        if (booking?.guestEmail && settings?.sendPaymentReceipt !== false) {
          try {
            await sendAirbnbPaymentReceivedEmail({
              to: booking.guestEmail,
              guestName: booking.guestName || "Guest",
              listingName: booking.listingName || "Airbnb Stay",
              amount: amountValue || payment.amount || 0,
              paymentDate: originationTime
                ? new Date(originationTime).toLocaleDateString("en-KE", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : new Date().toLocaleDateString("en-KE"),
              reference,
              supportEmail: settings?.supportEmail,
            });
          } catch (emailError) {
            logger.error("Failed to send Airbnb payment receipt email", {
              bookingId: booking.externalId,
              message: emailError instanceof Error ? emailError.message : String(emailError),
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("KopoKopo callback error", {
      message: error instanceof Error ? error.message : String(error),
      id,
      reference,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

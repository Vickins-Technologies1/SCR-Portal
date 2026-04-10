// src/app/api/kopokopo/incoming-payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { applyKopokopoPaymentUpdate } from "@/lib/kopokopo-incoming";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const apiKey = (process.env.KOPOKOPO_API_KEY || "").trim();
  const fallbackSecret = (process.env.KOPOKOPO_CLIENT_SECRET || "").trim();
  const secret = apiKey || fallbackSecret;
  const signature = request.headers.get("x-kopokopo-signature");

  const bodyText = await request.text();
  if (!secret) {
    logger.error("Missing KopoKopo webhook secret. Set KOPOKOPO_API_KEY.");
    return NextResponse.json({ success: false, message: "Webhook not configured" }, { status: 500 });
  }
  if (!signature) {
    logger.error("Missing KopoKopo signature");
    return NextResponse.json({ success: false, message: "Missing signature" }, { status: 401 });
  }
  if (!verifySignature(bodyText, signature, secret)) {
    logger.error("Invalid KopoKopo signature", { signature });
    return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
  }
  if (!apiKey) {
    logger.warn("KOPOKOPO_API_KEY missing; using client secret for webhook verification.");
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
  const parsedOrigination = originationTime ? new Date(originationTime) : null;
  const originationIso =
    parsedOrigination && !Number.isNaN(parsedOrigination.getTime()) ? parsedOrigination.toISOString() : originationTime;

  if (!id) {
    return NextResponse.json({ success: false, message: "Missing incoming payment id" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const receivedAt = new Date().toISOString();
    const rawBody =
      bodyText.length > 4000 ? `${bodyText.slice(0, 4000)}…(truncated)` : bodyText;

    let webhookId: ObjectId | null = null;
    try {
      const webhookInsert = await db.collection("kopokopoWebhooks").insertOne({
        receivedAt,
        incomingPaymentId: id,
        status,
        resourceStatus,
        reference,
        amount: amountValue,
        phoneNumber: senderPhone,
        originationTime: originationIso,
        signatureValid: true,
        rawBody,
      });
      webhookId = webhookInsert.insertedId;
    } catch (insertError) {
      logger.error("Failed to log KopoKopo webhook", {
        message: insertError instanceof Error ? insertError.message : String(insertError),
        id,
      });
    }
    const payment = await db.collection("payments").findOne({
      $or: [
        { kopokopoIncomingPaymentId: id },
        { transactionId: id },
        { checkoutRequestId: id },
        { merchantRequestId: id },
        ...(reference ? [{ reference }] : []),
      ],
    });

    if (!payment) {
      logger.error("KopoKopo callback payment not found", { id, reference });
      if (webhookId) {
        await db.collection("kopokopoWebhooks").updateOne(
          { _id: webhookId },
          { $set: { paymentMatched: false } }
        );
      }
      return NextResponse.json({ success: true });
    }

    const result = await applyKopokopoPaymentUpdate({
      db,
      payment,
      update: {
        id,
        status,
        resourceStatus,
        errors: errorsLower,
        reference,
        amount: amountValue,
        phoneNumber: senderPhone,
        originationTime: originationIso,
      },
    });
    if (webhookId) {
      await db.collection("kopokopoWebhooks").updateOne(
        { _id: webhookId },
        {
          $set: {
            paymentMatched: true,
            paymentId: payment._id.toString(),
            paymentStatus: result.normalizedStatus,
            tenantId: payment.tenantId ?? null,
            landlordId: payment.landlordId ?? null,
          },
        }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("KopoKopo callback error", {
      message: error instanceof Error ? error.message : String(error),
      id,
      reference,
    });
    return NextResponse.json({ success: true });
  }
}

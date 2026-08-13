import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { normalizeKopokopoPaymentStatus, verifyKopokopoWebhookSignature } from "@/lib/kopokopo";

type KopokopoWebhookPayload = {
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      status?: string;
      event?: {
        resource?: {
          id?: string;
          reference?: string;
          origination_time?: string;
          sender_phone_number?: string;
          amount?: string | number;
          till_number?: string;
          status?: string;
          sender_first_name?: string | null;
          sender_last_name?: string | null;
        } | null;
        errors?: string[] | null;
      };
      metadata?: {
        customer_id?: string;
        reference?: string;
        notes?: string;
      };
    };
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-kopokopo-signature");

  try {
    if (!verifyKopokopoWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
    }
  } catch (error) {
    logger.error("KopoKopo webhook signature validation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Webhook configuration error" }, { status: 500 });
  }

  let payload: KopokopoWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as KopokopoWebhookPayload;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const data = payload.data;
  const requestId = String(data?.id || "").trim();
  const status = normalizeKopokopoPaymentStatus({
    attributesStatus: data?.attributes?.status,
    resourceStatus: data?.attributes?.event?.resource?.status,
    errors: data?.attributes?.event?.errors,
  });
  const resource = data?.attributes?.event?.resource || undefined;
  const metadata = data?.attributes?.metadata || {};
  const reference = String(metadata.reference || resource?.reference || "").trim();
  const customerId = String(metadata.customer_id || "").trim();
  const paymentDate = resource?.origination_time ? new Date(resource.origination_time).toISOString() : new Date().toISOString();
  const amount = Number(resource?.amount || 0);
  const phone = String(resource?.sender_phone_number || "").trim();

  if (!requestId) {
    return NextResponse.json({ success: false, message: "Missing payment request ID" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const paymentQuery = {
      $or: [
        { kopokopoPaymentRequestId: requestId },
        { checkoutRequestId: requestId },
        { transactionId: requestId },
        ...(reference ? [{ reference }] : []),
        ...(customerId ? [{ invoiceId: customerId }] : []),
      ],
    };

    const payment = await db.collection("payments").findOne(paymentQuery);
    if (!payment) {
      logger.warn("KopoKopo webhook payment not found", { requestId, reference, customerId });
      return NextResponse.json({ success: true, message: "Accepted" }, { status: 200 });
    }

    const nextStatus = status === "completed" ? "completed" : status === "failed" ? "failed" : "pending";
    await db.collection("payments").updateOne(
      { _id: payment._id },
      {
        $set: {
          status: nextStatus,
          amount: Number.isFinite(amount) && amount > 0 ? amount : payment.amount,
          phoneNumber: phone || payment.phoneNumber,
          paymentDate,
          mpesaCode: resource?.id || resource?.reference || payment.mpesaCode || null,
          reference: reference || payment.reference,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (nextStatus === "completed" && payment.invoiceId && ObjectId.isValid(String(payment.invoiceId))) {
      await db.collection("invoices").updateOne(
        { _id: new ObjectId(String(payment.invoiceId)) },
        { $set: { status: "completed", updatedAt: new Date().toISOString() } }
      );
    }

    return NextResponse.json({ success: true, message: "Accepted" }, { status: 200 });
  } catch (error) {
    logger.error("KopoKopo webhook processing error", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
      reference,
    });
    return NextResponse.json({ success: true, message: "Accepted" }, { status: 200 });
  }
}

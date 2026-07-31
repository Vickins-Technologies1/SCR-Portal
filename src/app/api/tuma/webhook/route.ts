import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { applyTumaPaymentUpdate } from "@/lib/tuma-incoming";
import logger from "@/lib/logger";

function parseNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeWebhookPayload(payload: any) {
  const status =
    payload?.status ||
    payload?.payment_status ||
    payload?.result?.status ||
    payload?.data?.status ||
    "";
  const resultCode = payload?.result_code ?? payload?.resultCode ?? payload?.result?.code ?? payload?.data?.result_code;
  const resultDesc =
    payload?.result_desc ||
    payload?.resultDesc ||
    payload?.message ||
    payload?.failure_reason ||
    payload?.result?.description ||
    payload?.data?.result_desc ||
    "";
  const merchantRequestId =
    payload?.merchant_request_id ||
    payload?.merchantRequestId ||
    payload?.merchant_requestID ||
    payload?.data?.merchant_request_id ||
    "";
  const checkoutRequestId =
    payload?.checkout_request_id ||
    payload?.checkoutRequestId ||
    payload?.checkout_requestID ||
    payload?.data?.checkout_request_id ||
    "";
  const paymentId = payload?.payment_id || payload?.paymentId || payload?.id || payload?.data?.payment_id || "";
  const mpesaReceiptNumber =
    payload?.mpesa_receipt_number || payload?.mpesaReceiptNumber || payload?.receipt_number || "";
  const timestamp =
    payload?.timestamp ||
    payload?.transaction_timestamp ||
    payload?.transaction_date ||
    payload?.transactionDate ||
    payload?.paid_at ||
    payload?.paidAt ||
    payload?.payment_time ||
    payload?.data?.timestamp ||
    payload?.data?.transaction_timestamp ||
    payload?.data?.transaction_date ||
    payload?.data?.transactionDate ||
    payload?.data?.paid_at ||
    payload?.data?.paidAt ||
    payload?.data?.payment_time ||
    payload?.result?.timestamp ||
    payload?.result?.transaction_timestamp ||
    payload?.result?.transaction_date ||
    payload?.result?.transactionDate ||
    "";
  const phoneNumber =
    payload?.phone ||
    payload?.phone_number ||
    payload?.msisdn ||
    payload?.customer?.phone ||
    payload?.data?.phone ||
    "";
  const amount =
    parseNumber(payload?.amount) ??
    parseNumber(payload?.data?.amount) ??
    parseNumber(payload?.transaction_amount);

  return {
    status: status ? String(status) : "",
    resultCode,
    resultDesc: resultDesc ? String(resultDesc) : "",
    merchantRequestId: merchantRequestId ? String(merchantRequestId) : "",
    checkoutRequestId: checkoutRequestId ? String(checkoutRequestId) : "",
    paymentId: paymentId ? String(paymentId) : "",
    mpesaReceiptNumber: mpesaReceiptNumber ? String(mpesaReceiptNumber) : "",
    timestamp: timestamp ? String(timestamp) : "",
    phoneNumber: phoneNumber ? String(phoneNumber) : "",
    amount,
  };
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString();
  let rawBody = "";
  let payload: any = {};

  try {
    rawBody = await request.text();
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    logger.error("Tuma webhook: invalid JSON payload", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const normalized = normalizeWebhookPayload(payload);

  try {
    const { db } = await connectToDatabase();
    const matchFilters: Record<string, any>[] = [];
    if (normalized.checkoutRequestId) matchFilters.push({ checkoutRequestId: normalized.checkoutRequestId });
    if (normalized.merchantRequestId) matchFilters.push({ merchantRequestId: normalized.merchantRequestId });
    if (normalized.paymentId) {
      matchFilters.push({ tumaPaymentId: normalized.paymentId });
      matchFilters.push({ transactionId: normalized.paymentId });
    }

    let payment = matchFilters.length > 0 ? await db.collection("payments").findOne({ $or: matchFilters }) : null;
    const paymentMatched = !!payment;

    const webhookInsert = await db.collection("tumaWebhooks").insertOne({
      receivedAt,
      merchantRequestId: normalized.merchantRequestId,
      checkoutRequestId: normalized.checkoutRequestId,
      paymentGatewayId: normalized.paymentId,
      status: normalized.status,
      resultCode: normalized.resultCode ?? null,
      resultDesc: normalized.resultDesc,
      reference: normalized.mpesaReceiptNumber,
      amount: normalized.amount ?? null,
      phoneNumber: normalized.phoneNumber,
      timestamp: normalized.timestamp,
      paymentId: payment?._id || null,
      paymentStatus: payment?.status || "",
      paymentMatched,
      rawBody,
    });

    if (!payment) {
      return NextResponse.json({ success: true, message: "Webhook received (payment not matched)" }, { status: 200 });
    }

    if (payment.provider && payment.provider !== "tuma") {
      return NextResponse.json({ success: true, message: "Webhook ignored for non-Tuma payment" }, { status: 200 });
    }

    if (normalized.paymentId && !payment.tumaPaymentId) {
      await db.collection("payments").updateOne(
        { _id: payment._id },
        { $set: { tumaPaymentId: normalized.paymentId } }
      );
      payment = { ...payment, tumaPaymentId: normalized.paymentId };
    }

    const result = await applyTumaPaymentUpdate({
      db,
      payment,
      update: {
        id: normalized.checkoutRequestId || normalized.merchantRequestId || normalized.paymentId || payment._id.toString(),
        status: normalized.status,
        resultCode: normalized.resultCode,
        resultDesc: normalized.resultDesc,
        reference: normalized.mpesaReceiptNumber,
        mpesaReceiptNumber: normalized.mpesaReceiptNumber,
        amount: normalized.amount,
        phoneNumber: normalized.phoneNumber,
        timestamp: normalized.timestamp,
      },
    });

    await db.collection("tumaWebhooks").updateOne(
      { _id: webhookInsert.insertedId },
      {
        $set: {
          paymentId: payment._id,
          paymentStatus: result.payment?.status || payment.status,
          paymentMatched: true,
        },
      }
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("Tuma webhook error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Webhook processing failed" }, { status: 500 });
  }
}

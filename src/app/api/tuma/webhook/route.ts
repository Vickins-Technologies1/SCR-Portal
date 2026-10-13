import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";

function parseNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeWebhookPayload(payload: any) {
  const status = payload?.status || payload?.payment_status || payload?.result?.status || payload?.data?.status || "";
  const resultCode = payload?.result_code ?? payload?.resultCode ?? payload?.result?.code ?? payload?.data?.result_code;
  const merchantRequestId = payload?.merchant_request_id || payload?.merchantRequestId || payload?.merchant_requestID || payload?.data?.merchant_request_id || "";
  const checkoutRequestId = payload?.checkout_request_id || payload?.checkoutRequestId || payload?.checkout_requestID || payload?.data?.checkout_request_id || "";
  const paymentId = payload?.payment_id || payload?.paymentId || payload?.id || payload?.data?.payment_id || "";
  const receipt = payload?.mpesa_receipt_number || payload?.mpesaReceiptNumber || payload?.receipt_number || "";
  const timestamp = payload?.timestamp || payload?.transaction_timestamp || payload?.transaction_date || payload?.transactionDate || payload?.paid_at || payload?.paidAt || payload?.payment_time || payload?.data?.timestamp || "";
  const phone = payload?.phone || payload?.phone_number || payload?.msisdn || payload?.customer?.phone || payload?.data?.phone || "";
  const amount = parseNumber(payload?.amount) ?? parseNumber(payload?.data?.amount) ?? parseNumber(payload?.transaction_amount);

  return {
    status: status ? String(status) : "",
    resultCode: resultCode ?? null,
    merchantRequestId: merchantRequestId ? String(merchantRequestId) : "",
    checkoutRequestId: checkoutRequestId ? String(checkoutRequestId) : "",
    paymentId: paymentId ? String(paymentId) : "",
    receipt: receipt ? String(receipt) : "",
    timestamp: timestamp ? String(timestamp) : "",
    phone: phone ? String(phone) : "",
    amount: amount ?? null,
  };
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const normalized = normalizeWebhookPayload(payload);
  try {
    const { db } = await connectToDatabase();
    await db.collection("tumaWebhooks").insertOne({
      receivedAt: new Date().toISOString(),
      merchantRequestId: normalized.merchantRequestId,
      checkoutRequestId: normalized.checkoutRequestId,
      paymentGatewayId: normalized.paymentId,
      status: normalized.status,
      resultCode: normalized.resultCode,
      reference: normalized.receipt,
      amount: normalized.amount,
      phoneNumber: normalized.phone ? `***${normalized.phone.replace(/\D/g, "").slice(-4)}` : "",
      timestamp: normalized.timestamp,
      authenticityVerified: false,
      paymentMatched: false,
      processingStatus: "held_for_reconciliation",
      reason: "provider_callback_authentication_not_configured",
    });

    // Current repository integration has no Tuma webhook signature, shared
    // callback credential, or authenticated status lookup. Do not treat this
    // request as authority to update a payment or apply financial effects.
    return NextResponse.json({ success: true, message: "Webhook accepted for reconciliation" }, { status: 200 });
  } catch {
    logger.error("Tuma webhook could not be recorded", { category: "storage_error" });
    return NextResponse.json({ success: false, message: "Webhook processing failed" }, { status: 500 });
  }
}

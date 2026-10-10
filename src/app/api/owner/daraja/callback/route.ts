import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { DarajaCallbackSchema, claimDarajaCallback, markDarajaEffectsApplied } from "@/lib/daraja-callback";
import { activateLifetimeFromVerifiedPayment } from "@/lib/lifetime";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DarajaCallbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const callback = parsed.data.Body.stkCallback;
    const claimed = await claimDarajaCallback(db, callback);
    if (!claimed.payment) {
      await db.collection("unmatchedMpesaCallbacks").updateOne(
        { checkoutRequestId: callback.CheckoutRequestID },
        {
          $setOnInsert: {
            provider: "daraja",
            merchantRequestId: callback.MerchantRequestID,
            checkoutRequestId: callback.CheckoutRequestID,
            resultCode: callback.ResultCode,
            resultDesc: callback.ResultDesc,
            metadata: claimed.metadata,
            status: claimed.status,
            receivedAt: new Date().toISOString(),
            resolved: false,
          },
        },
        { upsert: true },
      );
      logger.warn("Owner Daraja callback received but payment not found", {
        checkoutRequestId: callback.CheckoutRequestID,
        provider: "daraja",
      });
    } else {
      let canMarkCallbackEffects = true;
      if (claimed.shouldProcessEffects && claimed.status === "completed" && claimed.payment.tenantId && !claimed.payment.airbnbBookingId) {
        const posting = await postVerifiedPayment({
          db,
          paymentId: claimed.payment._id,
          providerConfirmedAmount: claimed.metadata.amount || claimed.payment.providerConfirmedAmount,
          providerTransactionId: callback.CheckoutRequestID,
          providerReceipt: claimed.metadata.receipt || null,
        });
        if (posting.outcome === "quarantined") {
          return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" }, { status: 200 });
        }
        if (posting.outcome === "duplicate") {
          if (String(posting.payment?._id) !== String(claimed.payment._id)) {
            await db.collection("payments").updateOne(
              { _id: claimed.payment._id, financialPostingStatus: { $ne: "posted" } },
              { $set: { financialPostingStatus: "quarantined", financialReviewReason: "Provider transaction identity is already posted to another payment.", updatedAt: new Date().toISOString() } },
            );
            canMarkCallbackEffects = false;
          } else {
            const current = await db.collection("payments").findOne({ _id: claimed.payment._id }, { projection: { financialPostingStatus: 1, financialEffectsApplied: 1 } });
            canMarkCallbackEffects = current?.financialPostingStatus === "posted" || current?.financialEffectsApplied === true;
          }
        }
      }
      if (claimed.shouldProcessEffects && claimed.status === "completed" && claimed.payment.planType === "lifetime" && claimed.payment.billingType === "one_time") {
        await activateLifetimeFromVerifiedPayment({
          db,
          paymentId: claimed.payment._id,
          providerReference: claimed.metadata.receipt || callback.CheckoutRequestID,
        });
      }
      if (canMarkCallbackEffects) await markDarajaEffectsApplied(db, claimed.payment._id);
      logger.info("Owner Daraja callback processed", {
        paymentId: claimed.payment.paymentId || String(claimed.payment._id),
        checkoutRequestId: callback.CheckoutRequestID,
        provider: "daraja",
        status: claimed.status,
        resultCode: callback.ResultCode,
      });
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  } catch (error) {
    logger.error("Owner Daraja callback processing error", {
      message: error instanceof Error ? error.message : String(error),
      provider: "daraja",
    });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { DarajaCallbackSchema, classifyDarajaResult, extractDarajaMetadata } from "@/lib/daraja-callback";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = DarajaCallbackSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Invalid owner invoice Daraja callback payload", { issues: parsed.error.issues });
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  }
  try {
    const callback = parsed.data.Body.stkCallback;
    const metadata = extractDarajaMetadata(callback.CallbackMetadata?.Item);
    const { db } = await connectToDatabase();
    const payment = await db.collection("payments").findOne({ paymentRail: "property_owner_invoice_daraja", checkoutRequestId: callback.CheckoutRequestID });
    if (!payment) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    const status = classifyDarajaResult(callback.ResultCode, callback.ResultDesc);
    const now = new Date().toISOString();
    const claimed = await db.collection("payments").findOneAndUpdate(
      { _id: payment._id, paymentRail: "property_owner_invoice_daraja", status: { $in: ["pending", "processing"] } },
      { $set: { status, resultCode: callback.ResultCode, resultDescription: callback.ResultDesc, mpesaReceiptNumber: metadata.receipt || null, mpesaCode: metadata.receipt || null, transactionDate: metadata.transactionDate || null, rawCallbackData: payload, updatedAt: now } },
      { returnDocument: "after" }
    );
    // A duplicate success callback can recover a prior interrupted posting.
    // postVerifiedPayment owns the conditional processing claim and makes
    // concurrent retries safe.
    const claimedPayment = claimed?.value ?? claimed ?? (status === "completed" && payment.status === "completed" ? payment : null);
    if (status === "completed" && claimedPayment) {
      const invoiceId = String(claimedPayment.invoiceId || "");
      const invoice = ObjectId.isValid(invoiceId)
        ? await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId), userId: String(claimedPayment.ownerId) })
        : null;
      if (!invoice || metadata.amount !== Number(claimedPayment.amount)) {
        await db.collection("payments").updateOne(
          { _id: claimedPayment._id, financialPostingStatus: { $ne: "posted" } },
          { $set: {
            financialPostingStatus: "quarantined",
            financialReviewReason: !invoice ? "Invoice payment is not linked to an invoice owned by the payment owner." : "Provider-confirmed amount does not match the requested invoice payment amount.",
            updatedAt: new Date().toISOString(),
          } },
        );
      } else {
        const posting = await postVerifiedPayment({
          db,
          paymentId: claimedPayment._id,
          providerConfirmedAmount: metadata.amount,
          providerTransactionId: callback.CheckoutRequestID,
          providerReceipt: metadata.receipt || null,
        });
        if (posting.outcome === "quarantined") {
          logger.warn("Owner invoice payment quarantined during financial posting", { paymentId: String(claimedPayment._id), reason: posting.reason });
        }
      }
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    logger.error("Owner invoice Daraja callback processing error", { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}

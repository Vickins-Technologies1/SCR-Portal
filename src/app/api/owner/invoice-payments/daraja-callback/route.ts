import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { DarajaCallbackSchema, classifyDarajaResult, extractDarajaMetadata } from "@/lib/daraja-callback";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = DarajaCallbackSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  try {
    const callback = parsed.data.Body.stkCallback;
    const metadata = extractDarajaMetadata(callback.CallbackMetadata?.Item);
    const { db } = await connectToDatabase();
    const payment = await db.collection("payments").findOne({ paymentRail: "property_owner_invoice_daraja", checkoutRequestId: callback.CheckoutRequestID });
    if (!payment) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    const status = classifyDarajaResult(callback.ResultCode, callback.ResultDesc);
    const claimed = await db.collection("payments").findOneAndUpdate(
      { _id: payment._id, paymentRail: "property_owner_invoice_daraja", status: { $in: ["pending", "processing"] } },
      { $set: { status, resultCode: callback.ResultCode, resultDescription: callback.ResultDesc, mpesaReceiptNumber: metadata.receipt || null, mpesaCode: metadata.receipt || null, transactionDate: metadata.transactionDate || null, rawCallbackData: payload, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" }
    );
    const claimedPayment = claimed?.value;
    if (status === "completed" && claimedPayment) {
      const invoiceId = String(claimedPayment.invoiceId || "");
      if (ObjectId.isValid(invoiceId) && metadata.amount === Number(claimedPayment.amount)) {
        await db.collection("invoices").updateOne({ _id: new ObjectId(invoiceId), userId: String(claimedPayment.ownerId), status: "pending" }, { $set: { status: "completed", paidAt: new Date().toISOString(), paymentProvider: "daraja", paymentReference: metadata.receipt || callback.CheckoutRequestID, updatedAt: new Date() } });
      } else if (metadata.amount !== Number(claimedPayment.amount)) {
        await db.collection("payments").updateOne({ _id: claimedPayment._id }, { $set: { status: "failed", resultDescription: "Payment amount does not match invoice amount", updatedAt: new Date().toISOString() } });
      }
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    logger.error("Owner invoice Daraja callback processing error", { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}

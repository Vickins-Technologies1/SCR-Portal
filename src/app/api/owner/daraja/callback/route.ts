import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { DarajaCallbackSchema, claimDarajaCallback, markDarajaEffectsApplied } from "@/lib/daraja-callback";

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
      logger.warn("Owner Daraja callback received but payment not found", {
        checkoutRequestId: callback.CheckoutRequestID,
        provider: "daraja",
      });
    } else {
      await markDarajaEffectsApplied(db, claimed.payment._id);
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

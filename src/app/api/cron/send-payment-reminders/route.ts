// app/api/cron/send-payment-reminders/route.ts
import { NextResponse } from "next/server";
import { sendPaymentReminders } from "../../../../lib/reminders";
import { authorizeCronRequest } from "../../../../lib/cron-auth";

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  }
  console.log("Vercel Cron triggered: Running payment reminder job");

  try {
    const { sent, skipped } = await sendPaymentReminders({});

    return NextResponse.json({
      success: true,
      message: `Payment reminders job completed. Sent ${sent}, skipped ${skipped}.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Payment reminders cron job failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Payment reminders job failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

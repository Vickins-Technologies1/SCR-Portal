// app/api/cron/renew-invoices/route.ts
import { NextResponse } from "next/server";
import checkAndRenewExpiredInvoices from "../../../../cron/check-expired-invoices/route";
import { authorizeCronRequest } from "../../../../lib/cron-auth";
import { connectToDatabase } from "../../../../lib/mongodb";
import { withCronJobLock } from "../../../../lib/cron-lock";

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  }
  console.log("Vercel Cron triggered: Running invoice renewal job");

  try {
    const { db } = await connectToDatabase();
    const run = await withCronJobLock(db, "renew-invoices", checkAndRenewExpiredInvoices);
    if (!run.acquired) return NextResponse.json({ success: true, skipped: true, reason: "already_running" });

    return NextResponse.json({
      success: true,
      message: "Expired invoice renewal job completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Invoice renewal job failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Important: Prevent caching and force runtime execution on every cron trigger
export const dynamic = "force-dynamic";
export const revalidate = 0;

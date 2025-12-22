// app/api/cron/renew-invoices/route.ts
import { NextResponse } from "next/server";
import checkAndRenewExpiredInvoices from "../../../../cron/check-expired-invoices/route";

export async function GET() {
  console.log("Vercel Cron triggered: Running invoice renewal job");

  try {
    await checkAndRenewExpiredInvoices();

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
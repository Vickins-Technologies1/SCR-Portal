import { NextResponse } from "next/server";
import { sendInvoiceReminders } from "@/lib/invoice-reminders";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { withCronJobLock } from "@/lib/cron-lock";
import { sendTenantInvoiceReminders } from "@/lib/tenant-invoice-reminders";

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  }
  console.log("Vercel Cron triggered: Running invoice reminder job");

  try {
    const { db } = await connectToDatabase();
    const run = await withCronJobLock(db, "send-invoice-reminders", async () => {
      const platformInvoices = await sendInvoiceReminders({});
      const tenantInvoices = await sendTenantInvoiceReminders();
      return { platformInvoices, tenantInvoices };
    });
    if (!run.acquired) return NextResponse.json({ success: true, skipped: true, reason: "already_running" });
    const sent = run.result.platformInvoices.sent + run.result.tenantInvoices.sent;
    const skipped = run.result.platformInvoices.skipped + run.result.tenantInvoices.skipped;

    return NextResponse.json({
      success: true,
      message: `Invoice reminders job completed. Sent ${sent}, skipped ${skipped}.`,
      tenantInvoiceReminders: run.result.tenantInvoices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Invoice reminders cron job failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Invoice reminders job failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;


import { NextResponse } from "next/server";
import { sendInvoiceReminders } from "@/lib/invoice-reminders";

export async function GET() {
  console.log("Vercel Cron triggered: Running invoice reminder job");

  try {
    const { sent, skipped } = await sendInvoiceReminders({});

    return NextResponse.json({
      success: true,
      message: `Invoice reminders job completed. Sent ${sent}, skipped ${skipped}.`,
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


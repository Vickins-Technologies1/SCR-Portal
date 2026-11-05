import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { withCronJobLock } from "@/lib/cron-lock";
import { sendOverdueTenantInvoicesOnRentDueDate } from "@/lib/tenant-invoice-auto-delivery";

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  }

  try {
    const { db } = await connectToDatabase();
    const run = await withCronJobLock(
      db,
      "generate-tenant-invoices",
      () => sendOverdueTenantInvoicesOnRentDueDate(db),
    );
    if (!run.acquired) return NextResponse.json({ success: true, skipped: true, reason: "already_running" });
    return NextResponse.json({ success: true, ...run.result });
  } catch (error) {
    console.error("Tenant invoice due-date delivery failed", error);
    return NextResponse.json({ success: false, message: "Tenant invoice delivery failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

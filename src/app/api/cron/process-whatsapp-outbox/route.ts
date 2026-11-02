import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { withCronJobLock } from "@/lib/cron-lock";
import { processOpenWaOutbox } from "@/lib/whatsapp-gateway";

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  try {
    const { db } = await connectToDatabase();
    const run = await withCronJobLock(db, "process-whatsapp-outbox", () => processOpenWaOutbox(db, 20));
    if (!run.acquired) return NextResponse.json({ success: true, skipped: true, reason: "already_running" });
    return NextResponse.json({ success: true, ...run.result, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ success: false, message: "WhatsApp outbox processing failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/system-error-monitor";

export async function POST(request: NextRequest) {
  if (process.env.ERROR_MONITOR_INTERNAL_KEY && request.headers.get("x-sorana-monitor-key") !== process.env.ERROR_MONITOR_INTERNAL_KEY) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const body = await request.json();
    await captureException(new Error(typeof body.message === "string" ? body.message : "Server request error"), {
      route: body.route, endpoint: body.endpoint, method: body.method, requestId: body.requestId,
      userAgent: body.userAgent, metadata: { stack: body.stack, ...(body.metadata || {}) },
    });
  } catch { /* monitoring must never affect the application */ }
  return NextResponse.json({ ok: true });
}

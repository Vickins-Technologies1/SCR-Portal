import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/system-error-monitor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await captureException(new Error(typeof body.message === "string" ? body.message : "Client runtime error"), {
      route: typeof body.route === "string" ? body.route : undefined,
      endpoint: "/api/system-errors/client", method: "CLIENT",
      requestId: request.headers.get("x-request-id"), userAgent: request.headers.get("user-agent"),
      metadata: { stack: body.stack, ...(body.metadata || {}) },
    });
  } catch { /* monitoring must never affect the client */ }
  return NextResponse.json({ ok: true });
}

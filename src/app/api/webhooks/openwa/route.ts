import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { applyOpenWaDeliveryEvent, verifyOpenWaWebhookSignature } from "@/lib/whatsapp-gateway";

export async function POST(request: NextRequest) {
  const secret = process.env.OPENWA_WEBHOOK_SECRET || "";
  if (secret.length < 16) return NextResponse.json({ success: false }, { status: 503 });
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 64 * 1024) return NextResponse.json({ success: false }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ success: false }, { status: 400 });
  const chunks: Buffer[] = [];
  let bodySize = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bodySize += chunk.value.byteLength;
    if (bodySize > 64 * 1024) {
      await reader.cancel();
      return NextResponse.json({ success: false }, { status: 413 });
    }
    chunks.push(Buffer.from(chunk.value));
  }
  const raw = Buffer.concat(chunks, bodySize);
  if (!verifyOpenWaWebhookSignature(raw, request.headers.get("x-openwa-signature"), secret)) return NextResponse.json({ success: false }, { status: 401 });
  let event: unknown;
  try { event = JSON.parse(raw.toString("utf8")); } catch { return NextResponse.json({ success: false }, { status: 400 }); }
  try {
    const { db } = await connectToDatabase();
    const eventHeader = request.headers.get("x-openwa-event");
    const eventWithHeader = event && typeof event === "object" && !("event" in event) && eventHeader ? { ...event, event: eventHeader } : event;
    const result = await applyOpenWaDeliveryEvent(db, eventWithHeader, request.headers.get("x-openwa-delivery-id") || request.headers.get("x-openwa-idempotency-key"));
    if (!result.accepted && result.reason !== "unsupported_event") return NextResponse.json({ success: false, reason: result.reason }, { status: 400 });
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

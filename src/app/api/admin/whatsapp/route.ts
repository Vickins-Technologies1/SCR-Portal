import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { connectToDatabase } from "@/lib/mongodb";
import { checkOpenWaSession, getOpenWaQr, listRecentWhatsAppAttempts, publicWhatsAppSettings, readWhatsAppSettings, saveWhatsAppSettings, sendOpenWaText } from "@/lib/whatsapp-gateway";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  try {
    const { db } = await connectToDatabase();
    const settings = await readWhatsAppSettings(db);
    return NextResponse.json({ success: true, settings: publicWhatsAppSettings(settings), attempts: await listRecentWhatsAppAttempts(db) });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load WhatsApp settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean" || typeof body.gatewayUrl !== "string" || typeof body.sessionId !== "string" || (body.apiKey !== undefined && typeof body.apiKey !== "string")) {
    return NextResponse.json({ success: false, message: "Invalid WhatsApp settings" }, { status: 400 });
  }
  try {
    const { db } = await connectToDatabase();
    const settings = await saveWhatsAppSettings(db, { enabled: body.enabled, gatewayUrl: body.gatewayUrl, sessionId: body.sessionId, apiKey: body.apiKey, updatedBy: auth.userId });
    await db.collection("auditLogs").insertOne({ action: "whatsapp_openwa_settings_updated", enabled: body.enabled, adminUserId: auth.userId, timestamp: new Date().toISOString() });
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save WhatsApp settings";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  const action = body?.action;
  try {
    const { db } = await connectToDatabase();
    if (action === "status") return NextResponse.json({ success: true, ...(await checkOpenWaSession(db)) });
    if (action === "qr") {
      const qrCode = await getOpenWaQr(db);
      return qrCode ? NextResponse.json({ success: true, qrCode }) : NextResponse.json({ success: false, message: "No QR code is currently available" }, { status: 404 });
    }
    if (action === "test") {
      const phone = typeof body.phone === "string" ? body.phone : "";
      const result = await sendOpenWaText(db, phone, "My Accurate Rent WhatsApp connection test. No action is required.", { type: "admin_test", recipientType: "admin_authorized_test_number" });
      await db.collection("auditLogs").insertOne({ action: "whatsapp_test_message_submitted", adminUserId: auth.userId, status: result.status, recipientMasked: phone.replace(/\D/g, "").replace(/^(\d{3})\d+(\d{3})$/, "$1••••$2"), timestamp: new Date().toISOString() });
      return NextResponse.json({ success: result.success, status: result.status, message: result.success ? "Gateway accepted the test request" : result.error }, { status: result.success ? 200 : 400 });
    }
    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "WhatsApp operation failed" }, { status: 502 });
  }
}

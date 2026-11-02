import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { connectToDatabase } from "@/lib/mongodb";
import { checkOpenWaSession, consumeWhatsAppAdminRateLimit, enqueueOpenWaText, getOpenWaQr, listRecentWhatsAppAttempts, processOpenWaOutbox, publicWhatsAppSettings, readWhatsAppSettings, saveWhatsAppSettings } from "@/lib/whatsapp-gateway";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  try {
    const { db } = await connectToDatabase();
    if (!(await consumeWhatsAppAdminRateLimit(db, `${auth.userId}:settings`, 20, 60_000))) return NextResponse.json({ success: false, message: "Too many WhatsApp settings requests" }, { status: 429 });
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
    if (!(await consumeWhatsAppAdminRateLimit(db, `${auth.userId}:settings`, 20, 60_000))) return NextResponse.json({ success: false, message: "Too many WhatsApp settings requests" }, { status: 429 });
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
    const limit = action === "qr" ? { maximum: 3, windowMs: 60_000 } : action === "test" ? { maximum: 5, windowMs: 60 * 60_000 } : { maximum: 20, windowMs: 60_000 };
    if (!(await consumeWhatsAppAdminRateLimit(db, `${auth.userId}:${String(action || "unknown")}`, limit.maximum, limit.windowMs))) return NextResponse.json({ success: false, message: "Too many WhatsApp requests" }, { status: 429 });
    if (action === "status") return NextResponse.json({ success: true, ...(await checkOpenWaSession(db)) });
    if (action === "qr") {
      const qrCode = await getOpenWaQr(db);
      return qrCode ? NextResponse.json({ success: true, qrCode }, { headers: { "Cache-Control": "no-store, private" } }) : NextResponse.json({ success: false, message: "No QR code is currently available" }, { status: 404, headers: { "Cache-Control": "no-store, private" } });
    }
    if (action === "test") {
      const phone = typeof body.phone === "string" ? body.phone : "";
      const result = await enqueueOpenWaText(db, phone, "My Accurate Rent WhatsApp connection test. No action is required.", { type: "admin_test", recipientType: "admin_authorized_test_number", authorizedTest: true });
      if (result.success && result.status === "queued" && result.messageId) await processOpenWaOutbox(db, 1, result.messageId);
      const attempt = result.messageId ? await db.collection("whatsappMessageAttempts").findOne({ _id: new ObjectId(result.messageId) }, { projection: { status: 1 } }) : null;
      const status = attempt?.status || result.status;
      const success = result.success && ["submitted", "sent", "delivered", "read"].includes(status);
      const digits = phone.replace(/\D/g, "");
      const recipientMasked = digits.length >= 7 ? `${digits.slice(0, 3)}••••${digits.slice(-3)}` : "***";
      await db.collection("auditLogs").insertOne({ action: "whatsapp_test_message_submitted", adminUserId: auth.userId, status, recipientMasked, timestamp: new Date().toISOString() });
      return NextResponse.json({ success, status, message: success ? "OpenWA accepted the test message; verify delivery on the recipient device" : result.error || `Test submission status: ${status}` }, { status: success ? 200 : 502 });
    }
    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "WhatsApp operation failed" }, { status: 502 });
  }
}

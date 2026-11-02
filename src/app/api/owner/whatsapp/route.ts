import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { consumeWhatsAppAdminRateLimit } from "@/lib/whatsapp-gateway";
import {
  connectOwnerWhatsApp,
  disconnectOwnerWhatsApp,
  getOwnerWhatsAppQr,
  publicOwnerWhatsApp,
  readOwnerWhatsApp,
  refreshOwnerWhatsAppStatus,
  setOwnerWhatsAppEnabled,
} from "@/lib/owner-whatsapp";

async function resolveOwner(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || !["propertyOwner", "teamMember"].includes(role || "")) return null;
  if (role === "propertyOwner") return { ownerId: userId, actorId: userId, canView: true, canEdit: true, isOwner: true };
  if (!ObjectId.isValid(userId)) return null;
  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), active: true });
  if (!member?.ownerId) return null;
  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  return {
    ownerId: member.ownerId.toString(),
    actorId: userId,
    canView: permissions.includes("integrations:view") || permissions.includes("settings:view"),
    canEdit: false,
    isOwner: false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveOwner(request);
    if (!context) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!context.canView) return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    const { db } = await connectToDatabase();
    if (!(await consumeWhatsAppAdminRateLimit(db, `${context.ownerId}:owner-whatsapp-status`, 30, 60_000))) {
      return NextResponse.json({ success: false, message: "Too many WhatsApp status requests" }, { status: 429 });
    }
    const integration = await readOwnerWhatsApp(db, context.ownerId);
    if (!integration?.sessionId) return NextResponse.json({ success: true, integration: publicOwnerWhatsApp(null) }, { headers: { "Cache-Control": "no-store" } });
    if (process.env.VERCEL_ENV === "preview") return NextResponse.json({ success: true, integration: publicOwnerWhatsApp(integration) }, { headers: { "Cache-Control": "no-store" } });
    const status = await refreshOwnerWhatsAppStatus(db, context.ownerId);
    return NextResponse.json({ success: true, integration: status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load WhatsApp connection" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV === "preview") return NextResponse.json({ success: false, message: "WhatsApp account management is available on the Production app only" }, { status: 403 });
  const context = await resolveOwner(request);
  if (!context) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!context.isOwner || !context.canEdit) return NextResponse.json({ success: false, message: "Only the property owner can connect WhatsApp" }, { status: 403 });
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  try {
    const { db } = await connectToDatabase();
    if (!(await consumeWhatsAppAdminRateLimit(db, `${context.ownerId}:owner-whatsapp`, 8, 10 * 60_000))) {
      return NextResponse.json({ success: false, message: "Too many WhatsApp connection requests" }, { status: 429 });
    }
    if (body.action === "connect") {
      const { sessionId } = await connectOwnerWhatsApp(db, context.ownerId);
      const qrCode = await getOwnerWhatsAppQr(db, context.ownerId);
      await db.collection("auditLogs").insertOne({ action: "owner_whatsapp_session_created", ownerId: new ObjectId(context.ownerId), actorId: context.actorId, timestamp: new Date().toISOString() });
      return NextResponse.json({ success: true, sessionId, qrCode }, { headers: { "Cache-Control": "no-store, private" } });
    }
    if (body.action === "qr") {
      const qrCode = await getOwnerWhatsAppQr(db, context.ownerId);
      return qrCode
        ? NextResponse.json({ success: true, qrCode }, { headers: { "Cache-Control": "no-store, private" } })
        : NextResponse.json({ success: false, message: "No QR code is currently available" }, { status: 404, headers: { "Cache-Control": "no-store, private" } });
    }
    if (body.action === "status") {
      return NextResponse.json({ success: true, integration: await refreshOwnerWhatsAppStatus(db, context.ownerId) });
    }
    if (body.action === "enabled" && typeof body.enabled === "boolean") {
      const integration = await setOwnerWhatsAppEnabled(db, context.ownerId, body.enabled);
      await db.collection("auditLogs").insertOne({ action: body.enabled ? "owner_whatsapp_notifications_enabled" : "owner_whatsapp_notifications_paused", ownerId: new ObjectId(context.ownerId), actorId: context.actorId, timestamp: new Date().toISOString() });
      return NextResponse.json({ success: true, integration });
    }
    if (body.action === "disconnect") {
      await disconnectOwnerWhatsApp(db, context.ownerId);
      await db.collection("auditLogs").insertOne({ action: "owner_whatsapp_disconnected", ownerId: new ObjectId(context.ownerId), actorId: context.actorId, timestamp: new Date().toISOString() });
      return NextResponse.json({ success: true, integration: publicOwnerWhatsApp(null) });
    }
    return NextResponse.json({ success: false, message: "Unknown WhatsApp action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "WhatsApp operation failed" }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../../../../lib/mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import { sendWelcomeSms } from "../../../../lib/sms";
import { sendWhatsAppMessage } from "../../../../lib/whatsapp";
import { sendAdminNotificationEmail } from "../../../../lib/email";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:notifications:send");
  if (auth instanceof NextResponse) return auth;
  const { db } = await connectToDatabase();
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 50)));
  const history = await db.collection("notifications").find({ audience: "owner", source: "admin" }).sort({ createdAt: -1 }).limit(limit).toArray();
  return NextResponse.json({ success: true, history: history.map((item) => ({ ...item, _id: item._id.toString() })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:notifications:send");
  if (auth instanceof NextResponse) return auth;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => ({}));
  const title = clean(body?.title);
  const message = clean(body?.message);
  if (!title || !message) return NextResponse.json({ success: false, message: "Title and message are required" }, { status: 400 });
  const channels = Array.isArray(body?.channels) ? body.channels.filter((channel: unknown) => ["app", "sms", "whatsapp", "email"].includes(String(channel))) : ["app", "sms", "whatsapp", "email"];
  if (channels.length === 0) return NextResponse.json({ success: false, message: "Select at least one delivery channel" }, { status: 400 });
  const requested = Array.isArray(body?.recipientIds) ? body.recipientIds.filter((id: unknown) => typeof id === "string" && ObjectId.isValid(id)) : [];
  const { db } = await connectToDatabase();
  const recipientQuery = body?.all === true ? { role: "propertyOwner" } : { _id: { $in: requested.map((id: string) => new ObjectId(id)) }, role: "propertyOwner" };
  const recipients = await db.collection("propertyOwners").find(recipientQuery, { projection: { _id: 1, name: 1, email: 1, phone: 1 } }).toArray();
  if (recipients.length === 0) return NextResponse.json({ success: false, message: "Select at least one property owner" }, { status: 400 });
  const now = new Date();
  const results = [];
  for (const owner of recipients) {
    const delivery: Record<string, string> = {};
    let notificationId: ObjectId | null = null;
    if (channels.includes("app")) {
      const inserted = await db.collection("notifications").insertOne({ ownerId: owner._id.toString(), tenantId: "all", audience: "owner", source: "admin", title, message, type: "other", status: "unread", deliveryMethod: "app", deliveryStatus: "success", senderAdminId: auth.userId, createdAt: now.toISOString() });
      notificationId = inserted.insertedId;
      delivery.app = "success";
    }
    if (channels.includes("sms")) {
      try { if (!owner.phone) throw new Error("Owner has no phone number"); await sendWelcomeSms({ phone: String(owner.phone), message: `${title}\n${message}` }); delivery.sms = "success"; } catch { delivery.sms = "failed"; }
    }
    if (channels.includes("whatsapp")) {
      const result = owner.phone ? await sendWhatsAppMessage({ phone: String(owner.phone), message: `${title}\n${message}` }) : { success: false };
      delivery.whatsapp = result.success ? "success" : "failed";
    }
    if (channels.includes("email")) {
      try { if (!owner.email) throw new Error("Owner has no email address"); await sendAdminNotificationEmail({ to: String(owner.email), name: String(owner.name || "Property Owner"), title, message }); delivery.email = "success"; } catch { delivery.email = "failed"; }
    }
    if (notificationId) await db.collection("notifications").updateOne({ _id: notificationId }, { $set: { channelDelivery: delivery, deliveryChannels: channels } });
    results.push({ ownerId: owner._id.toString(), delivery });
  }
  await db.collection("auditLogs").insertOne({ action: "admin_owner_notification_sent", adminUserId: auth.userId, recipientIds: results.map((item) => item.ownerId), channels, title, message, delivery: results, timestamp: now.toISOString() });
  return NextResponse.json({ success: true, count: results.length, results }, { status: 201 });
}

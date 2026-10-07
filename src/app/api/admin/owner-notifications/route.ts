import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../../../../lib/mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

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
  const title = clean(body?.title, 120);
  const message = clean(body?.message, 2000);
  if (!title || !message) return NextResponse.json({ success: false, message: "Title and message are required" }, { status: 400 });
  const requested = Array.isArray(body?.recipientIds) ? body.recipientIds.filter((id: unknown) => typeof id === "string" && ObjectId.isValid(id)) : [];
  const { db } = await connectToDatabase();
  const recipientQuery = body?.all === true ? { role: "propertyOwner" } : { _id: { $in: requested.map((id: string) => new ObjectId(id)) }, role: "propertyOwner" };
  const recipients = await db.collection("propertyOwners").find(recipientQuery, { projection: { _id: 1 } }).toArray();
  if (recipients.length === 0) return NextResponse.json({ success: false, message: "Select at least one property owner" }, { status: 400 });
  const now = new Date();
  const docs = recipients.map((owner) => ({ ownerId: owner._id.toString(), tenantId: "all", audience: "owner", source: "admin", title, message, type: "other", status: "unread", deliveryMethod: "app", deliveryStatus: "success", senderAdminId: auth.userId, createdAt: now.toISOString() }));
  await db.collection("notifications").insertMany(docs);
  await db.collection("auditLogs").insertOne({ action: "admin_owner_notification_sent", adminUserId: auth.userId, recipientIds: docs.map((doc) => doc.ownerId), title, message, timestamp: now.toISOString() });
  return NextResponse.json({ success: true, count: docs.length }, { status: 201 });
}

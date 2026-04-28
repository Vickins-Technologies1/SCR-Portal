import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { resolveTenantContext } from "@/lib/impersonation";

const SendMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

async function resolveAirbnbGuestBooking(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const { db } = await connectToDatabase();
  const tenantContext = await resolveTenantContext({
    db,
    userId,
    role,
    isImpersonating,
    impersonatingTenantId,
  });

  if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
    return { db, tenantContext: null, tenant: null, booking: null, bookingId: null };
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantContext.tenantId) });
  if (!tenant) {
    return { db, tenantContext, tenant: null, booking: null, bookingId: null };
  }

  if (tenant.accountType !== "airbnb_guest" || !tenant.airbnbBookingId) {
    return { db, tenantContext, tenant, booking: null, bookingId: null };
  }

  if (tenant.expiresAt) {
    const expiresAt = new Date(String(tenant.expiresAt));
    if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
      return { db, tenantContext, tenant: null, booking: null, bookingId: null };
    }
  }

  const bookingId = String(tenant.airbnbBookingId);
  const ownerId = String(tenant.ownerId || "");
  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
  if (!booking) {
    return { db, tenantContext, tenant, booking: null, bookingId };
  }

  return { db, tenantContext, tenant, booking, bookingId };
}

async function ensureConversation(db: any, params: { ownerId: string; bookingId: string; guestName: string; listingName: string; guestEmail?: string; guestPhone?: string }) {
  const nowIso = new Date().toISOString();

  const existing = await db.collection("airbnbConversations").findOne(
    { ownerId: params.ownerId, bookingId: params.bookingId },
    { projection: { externalId: 1 } }
  );
  if (existing?.externalId) return String(existing.externalId);

  const externalId = `convo-${new ObjectId().toString()}`;
  await db.collection("airbnbConversations").insertOne({
    ownerId: params.ownerId,
    bookingId: params.bookingId,
    externalId,
    guestName: params.guestName,
    listingName: params.listingName,
    lastMessage: "",
    unread: 0,
    channel: "Portal",
    guestEmail: params.guestEmail,
    guestPhone: params.guestPhone,
    lastMessageAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return externalId;
}

export async function GET(request: NextRequest) {
  const resolved = await resolveAirbnbGuestBooking(request);
  if (!resolved.tenantContext || !resolved.tenant || !resolved.booking) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const ownerId = String(resolved.tenant.ownerId || "");
  const bookingId = resolved.bookingId!;

  const conversationId = await ensureConversation(resolved.db, {
    ownerId,
    bookingId,
    guestName: String(resolved.booking.guestName || resolved.tenant.name || "Guest"),
    listingName: String(resolved.booking.listingName || resolved.tenant.houseNumber || "Airbnb Stay"),
    guestEmail: String(resolved.booking.guestEmail || resolved.tenant.email || ""),
    guestPhone: String(resolved.booking.guestPhone || resolved.tenant.phone || ""),
  });

  const rawMessages = await resolved.db
    .collection("airbnbConversationMessages")
    .find({ ownerId, conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(40)
    .toArray();

  const messages = rawMessages
    .map((m: any) => ({
      id: m._id?.toString?.() || "",
      sender: m.sender === "guest" ? "guest" : "host",
      message: String(m.message || ""),
      createdAt: m.createdAt,
    }))
    .reverse();

  return NextResponse.json({ success: true, messages });
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token") || request.headers.get("X-CSRF-Token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = SendMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid message payload" }, { status: 400 });
  }

  const resolved = await resolveAirbnbGuestBooking(request);
  if (!resolved.tenantContext || !resolved.tenant || !resolved.booking) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const ownerId = String(resolved.tenant.ownerId || "");
  const bookingId = resolved.bookingId!;

  const conversationId = await ensureConversation(resolved.db, {
    ownerId,
    bookingId,
    guestName: String(resolved.booking.guestName || resolved.tenant.name || "Guest"),
    listingName: String(resolved.booking.listingName || resolved.tenant.houseNumber || "Airbnb Stay"),
    guestEmail: String(resolved.booking.guestEmail || resolved.tenant.email || ""),
    guestPhone: String(resolved.booking.guestPhone || resolved.tenant.phone || ""),
  });

  const nowIso = new Date().toISOString();

  await resolved.db.collection("airbnbConversationMessages").insertOne({
    ownerId,
    conversationId,
    message: parsed.data.message,
    sender: "guest",
    createdAt: nowIso,
  });

  await resolved.db.collection("airbnbConversations").updateOne(
    { ownerId, externalId: conversationId },
    {
      $set: { lastMessage: parsed.data.message, lastMessageAt: nowIso, updatedAt: nowIso, channel: "Portal" },
      $inc: { unread: 1 },
    }
  );

  return NextResponse.json({ success: true });
}

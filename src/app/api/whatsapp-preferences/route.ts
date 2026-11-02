import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { normalizeWhatsAppPhone } from "@/lib/listing-contact";
import { hashWhatsAppConsentPhone } from "@/lib/whatsapp-crypto";
import { cancelWhatsAppRecipientOutbox } from "@/lib/whatsapp-gateway";

type PreferenceIdentity = { entityType: "tenant" | "owner"; entityId: ObjectId; account: Record<string, unknown> };

async function resolveIdentity(request: NextRequest): Promise<PreferenceIdentity | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session?.sub || session.impersonator || session.impersonatedTenantId || !ObjectId.isValid(session.sub)) return null;
  const { db } = await connectToDatabase();
  const entityId = new ObjectId(session.sub);
  if (session.role === "tenant") {
    const account = await db.collection("tenants").findOne({ _id: entityId, role: "tenant" }, { projection: { _id: 1, phone: 1 } });
    return account ? { entityType: "tenant", entityId, account } : null;
  }
  if (session.role === "propertyOwner") {
    const account = await db.collection("propertyOwners").findOne({ _id: entityId, role: "propertyOwner", accountStatus: { $ne: "suspended" } }, { projection: { _id: 1, phone: 1 } });
    return account ? { entityType: "owner", entityId, account } : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await resolveIdentity(request);
    if (!identity) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const { db } = await connectToDatabase();
    const preference = await db.collection("whatsappPreferences").findOne({ entityType: identity.entityType, entityId: identity.entityId }, { projection: { enabled: 1, consentPhoneHash: 1, consentAt: 1, revokedAt: 1, updatedAt: 1 } });
    const phone = normalizeWhatsAppPhone(typeof identity.account.phone === "string" ? identity.account.phone : "");
    const phoneMatchesConsent = Boolean(phone && preference?.consentPhoneHash === hashWhatsAppConsentPhone(phone));
    return NextResponse.json({ success: true, enabled: preference?.enabled === true && phoneMatchesConsent, consentAt: preference?.consentAt || null, revokedAt: preference?.revokedAt || null });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load WhatsApp preference" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ success: false, message: "enabled must be a boolean" }, { status: 400 });
  try {
    const identity = await resolveIdentity(request);
    if (!identity) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const normalizedPhone = normalizeWhatsAppPhone(typeof identity.account.phone === "string" ? identity.account.phone : "");
    if (body.enabled && (!normalizedPhone || !/^\d{10,15}$/.test(normalizedPhone))) return NextResponse.json({ success: false, message: "Add a valid phone number to your account before enabling WhatsApp messages" }, { status: 400 });
    const { db } = await connectToDatabase();
    const now = new Date();
    const update = body.enabled
      ? { $set: { entityType: identity.entityType, entityId: identity.entityId, enabled: true, consentAt: now, consentPhoneHash: hashWhatsAppConsentPhone(normalizedPhone!), consentSource: "authenticated_account_settings", consentVersion: "whatsapp-notifications-v1", updatedAt: now }, $unset: { revokedAt: "" } }
      : { $set: { entityType: identity.entityType, entityId: identity.entityId, enabled: false, revokedAt: now, updatedAt: now } };
    await db.collection("whatsappPreferences").updateOne({ entityType: identity.entityType, entityId: identity.entityId }, update, { upsert: true });
    if (!body.enabled) await cancelWhatsAppRecipientOutbox(db, identity.entityType, identity.entityId);
    await db.collection("auditLogs").insertOne({ action: body.enabled ? "whatsapp_consent_granted" : "whatsapp_consent_revoked", entityType: identity.entityType, entityId: identity.entityId.toHexString(), timestamp: now.toISOString() });
    return NextResponse.json({ success: true, enabled: body.enabled, updatedAt: now });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to update WhatsApp preference" }, { status: 500 });
  }
}

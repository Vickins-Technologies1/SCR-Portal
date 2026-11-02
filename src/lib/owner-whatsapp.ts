import "server-only";
import crypto from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { decryptWhatsAppApiKey, encryptWhatsAppApiKey } from "@/lib/whatsapp-crypto";

type OwnerWhatsAppIntegration = {
  enabled?: boolean;
  sessionId?: string;
  apiKeyEncrypted?: string;
  apiKeyId?: string;
  status?: string;
  phone?: string | null;
  connectedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const ownerCollection = "ownerIntegrations";

function gatewayUrl() {
  const host = (process.env.OPENWA_GATEWAY_HOSTS || "").split(",").map((value) => value.trim().toLowerCase()).find(Boolean);
  if (!host || !/^[a-z0-9.-]+$/.test(host)) throw new Error("OpenWA gateway host is not configured");
  return `https://${host}`;
}

function provisioningKey() {
  const key = process.env.OPENWA_PROVISIONING_KEY || "";
  if (key.length < 24) throw new Error("Owner WhatsApp connection is not configured yet");
  return key;
}

async function requestWithKey(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`${gatewayUrl()}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error("OpenWA returned an invalid response"); }
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : `OpenWA request failed (${response.status})`);
  return body;
}

export async function openWaRequest(path: string, init: RequestInit = {}) {
  return requestWithKey(path, provisioningKey(), init);
}

export async function readOwnerWhatsApp(db: Db, ownerId: string) {
  if (!ObjectId.isValid(ownerId)) return null;
  const owner = await db.collection(ownerCollection).findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { whatsapp: 1 } },
  );
  return (owner?.whatsapp || null) as OwnerWhatsAppIntegration | null;
}

export async function requestOwnerWhatsApp(db: Db, ownerId: string, path: string, init: RequestInit = {}) {
  const integration = await readOwnerWhatsApp(db, ownerId);
  if (!integration?.sessionId || !integration.apiKeyEncrypted) throw new Error("Owner WhatsApp is not connected");
  if (init.method === "POST" && path.endsWith("/messages/send-text") && integration.enabled !== true) throw new Error("Owner WhatsApp is not enabled");
  const key = decryptWhatsAppApiKey(integration.apiKeyEncrypted);
  return requestWithKey(`/api/sessions/${encodeURIComponent(integration.sessionId)}${path}`, key, init);
}

export function publicOwnerWhatsApp(integration: OwnerWhatsAppIntegration | null) {
  return {
    connected: integration?.status === "ready",
    enabled: integration?.enabled === true,
    status: integration?.status || "not_connected",
    phone: integration?.phone || null,
    connectedAt: integration?.connectedAt || null,
  };
}

export async function connectOwnerWhatsApp(db: Db, ownerId: string) {
  if (!ObjectId.isValid(ownerId)) throw new Error("Invalid property owner");
  const existing = await readOwnerWhatsApp(db, ownerId);
  if (existing?.sessionId) throw new Error("A WhatsApp session already exists for this owner");

  const created = await openWaRequest("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name: `owner-${ownerId}-${crypto.randomUUID().slice(0, 8)}` }),
  });
  const sessionId = typeof created.id === "string" ? created.id : "";
  if (!sessionId || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error("OpenWA did not return a valid session ID");

  let ownerApiKeyId = "";
  try {
    const createdKey = await openWaRequest("/api/auth/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: `Owner WhatsApp ${ownerId}`, role: "operator", allowedSessions: [sessionId] }),
    });
    const ownerApiKey = typeof createdKey.apiKey === "string" ? createdKey.apiKey : "";
    ownerApiKeyId = typeof createdKey.id === "string" ? createdKey.id : "";
    if (!ownerApiKey || !ownerApiKeyId) throw new Error("OpenWA did not return a scoped account key");
    await requestWithKey(`/api/sessions/${encodeURIComponent(sessionId)}/start`, ownerApiKey, { method: "POST" });
    const webhookSecret = process.env.OPENWA_WEBHOOK_SECRET || "";
    if (webhookSecret.length < 16) throw new Error("OpenWA webhook is not configured");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://www.myaccuraterent.com";
    await requestWithKey(`/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, ownerApiKey, {
      method: "POST",
      body: JSON.stringify({
        url: `${baseUrl.replace(/\/$/, "")}/api/webhooks/openwa`,
        events: ["message.ack", "message.failed", "message.received"],
        secret: webhookSecret,
      }),
    });
    const now = new Date();
    await db.collection(ownerCollection).updateOne(
      { ownerId: new ObjectId(ownerId) },
      {
        $set: { ownerId: new ObjectId(ownerId), whatsapp: { enabled: false, sessionId, apiKeyId: ownerApiKeyId, apiKeyEncrypted: encryptWhatsAppApiKey(ownerApiKey), status: "qr_ready", phone: null, connectedAt: null, createdAt: now, updatedAt: now }, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  } catch (error) {
    if (ownerApiKeyId) await openWaRequest(`/api/auth/api-keys/${encodeURIComponent(ownerApiKeyId)}/revoke`, { method: "POST" }).catch(() => undefined);
    await openWaRequest(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }

  return { sessionId };
}

export async function refreshOwnerWhatsAppStatus(db: Db, ownerId: string) {
  const integration = await readOwnerWhatsApp(db, ownerId);
  if (!integration?.sessionId) return publicOwnerWhatsApp(null);
  const session = await requestOwnerWhatsApp(db, ownerId, "");
  const status = typeof session.status === "string" ? session.status : "unknown";
  const phone = typeof session.phone === "string" ? session.phone : null;
  const connectedAt = status === "ready" ? integration.connectedAt || new Date() : null;
  await db.collection(ownerCollection).updateOne(
    { ownerId: new ObjectId(ownerId), "whatsapp.sessionId": integration.sessionId },
    { $set: { "whatsapp.status": status, "whatsapp.phone": phone, "whatsapp.connectedAt": connectedAt, "whatsapp.updatedAt": new Date() } },
  );
  return publicOwnerWhatsApp({ ...integration, status, phone, connectedAt });
}

export async function getOwnerWhatsAppQr(db: Db, ownerId: string) {
  const integration = await readOwnerWhatsApp(db, ownerId);
  if (!integration?.sessionId) throw new Error("Connect a WhatsApp account first");
  const response = await requestOwnerWhatsApp(db, ownerId, "/qr");
  return typeof response.qrCode === "string" && response.qrCode.startsWith("data:image/") ? response.qrCode : null;
}

export async function setOwnerWhatsAppEnabled(db: Db, ownerId: string, enabled: boolean) {
  const integration = await readOwnerWhatsApp(db, ownerId);
  if (!integration?.sessionId) throw new Error("Connect a WhatsApp account first");
  const session = await requestOwnerWhatsApp(db, ownerId, "");
  const status = typeof session.status === "string" ? session.status : "unknown";
  if (enabled && status !== "ready") throw new Error("Link the WhatsApp account before enabling tenant notifications");
  await db.collection(ownerCollection).updateOne(
    { ownerId: new ObjectId(ownerId), "whatsapp.sessionId": integration.sessionId },
    { $set: { "whatsapp.enabled": enabled, "whatsapp.status": status, "whatsapp.phone": typeof session.phone === "string" ? session.phone : null, "whatsapp.updatedAt": new Date() } },
  );
  if (!enabled) await db.collection("whatsappMessageAttempts").updateMany(
    { senderOwnerId: ownerId, status: { $in: ["queued", "retry_wait"] } },
    { $set: { status: "cancelled", errorCategory: "owner_whatsapp_paused", updatedAt: new Date() }, $unset: { encryptedPayload: "", nextAttemptAt: "" } },
  );
  return publicOwnerWhatsApp({ ...integration, enabled, status, phone: typeof session.phone === "string" ? session.phone : null });
}

export async function disconnectOwnerWhatsApp(db: Db, ownerId: string) {
  const integration = await readOwnerWhatsApp(db, ownerId);
  if (!integration?.sessionId) return;
  if (integration.apiKeyId) await openWaRequest(`/api/auth/api-keys/${encodeURIComponent(integration.apiKeyId)}/revoke`, { method: "POST" }).catch(() => undefined);
  await openWaRequest(`/api/sessions/${encodeURIComponent(integration.sessionId)}`, { method: "DELETE" });
  await db.collection(ownerCollection).updateOne(
    { ownerId: new ObjectId(ownerId) },
    { $unset: { whatsapp: "" }, $set: { updatedAt: new Date() } },
  );
  await db.collection("whatsappMessageAttempts").updateMany(
    { senderOwnerId: ownerId, status: { $in: ["queued", "retry_wait"] } },
    { $set: { status: "cancelled", errorCategory: "owner_whatsapp_disconnected", updatedAt: new Date() }, $unset: { encryptedPayload: "", nextAttemptAt: "" } },
  );
}

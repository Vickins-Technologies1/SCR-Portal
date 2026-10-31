import "server-only";
import { ObjectId, type Db } from "mongodb";
import { decryptWhatsAppApiKey, encryptWhatsAppApiKey } from "@/lib/whatsapp-crypto";
import { normalizeWhatsAppPhone } from "@/lib/listing-contact";

const SETTINGS_ID = "openwa";
const REQUEST_TIMEOUT_MS = 8_000;

export type OpenWaStatus = "connected" | "connecting" | "qr_required" | "disconnected" | "unknown";

type WhatsAppSettings = {
  _id: string;
  enabled?: boolean;
  gatewayUrl?: string;
  sessionId?: string;
  apiKeyEncrypted?: string;
  lastCheckAt?: Date;
  lastCheckError?: string | null;
  lastSessionStatus?: OpenWaStatus;
  updatedAt?: Date;
};

export function validateGatewayUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Gateway URL must be a valid absolute URL"); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:")) {
    throw new Error("Gateway URL must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("Gateway URL cannot include credentials, query parameters, or a fragment");
  return url.toString().replace(/\/$/, "");
}

export function normalizeOpenWaStatus(raw: unknown): OpenWaStatus {
  if (typeof raw !== "string") return "unknown";
  const status = raw.toLowerCase();
  if (["ready", "connected", "authenticated"].includes(status)) return "connected";
  if (["qr_ready", "qr", "pairing", "awaiting_qr"].includes(status)) return "qr_required";
  if (["connecting", "initializing", "starting", "reconnecting"].includes(status)) return "connecting";
  if (["disconnected", "stopped", "logged_out", "failed"].includes(status)) return "disconnected";
  return "unknown";
}

export async function readWhatsAppSettings(db: Db) {
  return db.collection<WhatsAppSettings>("systemSettings").findOne({ _id: SETTINGS_ID } as never);
}

export function publicWhatsAppSettings(settings: WhatsAppSettings | null) {
  return {
    enabled: settings?.enabled === true,
    gatewayUrl: settings?.gatewayUrl || "",
    sessionId: settings?.sessionId || "",
    apiKeyConfigured: Boolean(settings?.apiKeyEncrypted),
    sessionStatus: settings?.lastSessionStatus || "unknown",
    lastCheckAt: settings?.lastCheckAt || null,
    lastCheckError: settings?.lastCheckError || null,
  };
}

export async function saveWhatsAppSettings(db: Db, input: { enabled: boolean; gatewayUrl: string; sessionId: string; apiKey?: string; updatedBy: string }) {
  const gatewayUrl = validateGatewayUrl(input.gatewayUrl);
  const sessionId = input.sessionId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error("Session ID must contain 1–128 letters, numbers, underscores, or hyphens");
  const existing = await readWhatsAppSettings(db);
  const apiKey = input.apiKey?.trim();
  if (!existing?.apiKeyEncrypted && !apiKey) throw new Error("Enter the OpenWA API key before saving");
  const now = new Date();
  const update: Record<string, unknown> = { enabled: input.enabled, gatewayUrl, sessionId, updatedBy: input.updatedBy, updatedAt: now };
  if (apiKey) update.apiKeyEncrypted = encryptWhatsAppApiKey(apiKey);
  await db.collection("systemSettings").updateOne(
    { _id: SETTINGS_ID } as never,
    { $set: update, $setOnInsert: { key: "whatsappOpenWa", createdAt: now } },
    { upsert: true },
  );
  return publicWhatsAppSettings(await readWhatsAppSettings(db));
}

async function requestGateway(db: Db, path: string, init: RequestInit = {}) {
  const settings = await readWhatsAppSettings(db);
  if (!settings?.gatewayUrl || !settings.sessionId || !settings.apiKeyEncrypted) throw new Error("OpenWA is not configured");
  const apiKey = decryptWhatsAppApiKey(settings.apiKeyEncrypted);
  const url = `${validateGatewayUrl(settings.gatewayUrl)}/api/sessions/${encodeURIComponent(settings.sessionId)}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: { "X-API-Key": apiKey, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  const bodyText = await response.text();
  let body: Record<string, unknown> = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { throw new Error("OpenWA returned an invalid response"); }
  if (!response.ok) throw new Error(`OpenWA request failed (${response.status})`);
  return body;
}

export async function checkOpenWaSession(db: Db) {
  const now = new Date();
  try {
    const body = await requestGateway(db, "");
    const status = normalizeOpenWaStatus(body.status);
    await db.collection("systemSettings").updateOne({ _id: SETTINGS_ID } as never, { $set: { lastCheckAt: now, lastCheckError: null, lastSessionStatus: status } });
    return { gateway: "reachable" as const, session: status, lastCheckAt: now, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenWA unavailable";
    await db.collection("systemSettings").updateOne({ _id: SETTINGS_ID } as never, { $set: { lastCheckAt: now, lastCheckError: message } });
    return { gateway: "unavailable" as const, session: "unknown" as const, lastCheckAt: now, error: message };
  }
}

export async function getOpenWaQr(db: Db) {
  const body = await requestGateway(db, "/qr");
  return typeof body.qrCode === "string" && body.qrCode.startsWith("data:image/") ? body.qrCode : null;
}

export async function sendOpenWaText(db: Db, phone: string, message: string, options: { type: string; recipientType?: string; recipientId?: string; idempotencyKey?: string } = { type: "notification" }) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized || !/^\d{10,15}$/.test(normalized)) return { success: false as const, status: "rejected" as const, error: "Invalid phone number" };
  if (!message.trim() || message.length > 4096) return { success: false as const, status: "rejected" as const, error: "Message must contain 1–4096 characters" };
  const id = new ObjectId();
  const now = new Date();
  const attempts = db.collection("whatsappMessageAttempts");
  if (options.idempotencyKey) {
    const inserted = await attempts.updateOne(
      { idempotencyKey: options.idempotencyKey },
      { $setOnInsert: { _id: id, idempotencyKey: options.idempotencyKey, type: options.type, recipientType: options.recipientType || "unknown", recipientId: options.recipientId || null, recipientMasked: `${normalized.slice(0, 3)}••••${normalized.slice(-3)}`, status: "queued", attempts: 0, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
    if (!inserted.upsertedCount) return { success: true as const, status: "duplicate" as const, messageId: null };
  } else {
    await attempts.insertOne({ _id: id, type: options.type, recipientType: options.recipientType || "unknown", recipientId: options.recipientId || null, recipientMasked: `${normalized.slice(0, 3)}••••${normalized.slice(-3)}`, status: "queued", attempts: 0, createdAt: now, updatedAt: now });
  }
  try {
    const body = await requestGateway(db, "/messages/send-text", { method: "POST", body: JSON.stringify({ chatId: `${normalized}@c.us`, text: message }) });
    const gatewayMessageId = typeof body.id === "string" ? body.id : typeof body.messageId === "string" ? body.messageId : null;
    await attempts.updateOne({ _id: id }, { $set: { status: "submitted", gatewayMessageId, attempts: 1, lastAttemptAt: new Date(), updatedAt: new Date() } });
    return { success: true as const, status: "submitted" as const, messageId: id.toHexString(), gatewayMessageId };
  } catch (error) {
    // A timeout may happen after OpenWA accepted the request. Record unknown and never retry blindly.
    const message = error instanceof Error && error.name === "TimeoutError" ? "submission_outcome_unknown" : "gateway_error";
    await attempts.updateOne({ _id: id }, { $set: { status: message === "submission_outcome_unknown" ? "unknown" : "failed", errorCategory: message, attempts: 1, lastAttemptAt: new Date(), updatedAt: new Date() } });
    return { success: false as const, status: message === "submission_outcome_unknown" ? "unknown" as const : "failed" as const, error: message };
  }
}

export async function listRecentWhatsAppAttempts(db: Db, limit = 50) {
  return db.collection("whatsappMessageAttempts").find({}, { projection: { recipientMasked: 1, type: 1, status: 1, gatewayMessageId: 1, errorCategory: 1, attempts: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).limit(limit).toArray();
}

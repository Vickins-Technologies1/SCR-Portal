import "server-only";
import crypto from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { decryptWhatsAppApiKey, encryptWhatsAppApiKey, hashWhatsAppConsentPhone } from "@/lib/whatsapp-crypto";
import { normalizeWhatsAppPhone } from "@/lib/listing-contact";
import { requestOwnerWhatsApp } from "@/lib/owner-whatsapp";

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
  if (process.env.NODE_ENV === "production") {
    const allowedHosts = (process.env.OPENWA_GATEWAY_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
    if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("Gateway host is not in OPENWA_GATEWAY_HOSTS");
  }
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
  if (input.enabled && process.env.NODE_ENV === "production" && (process.env.OPENWA_WEBHOOK_SECRET || "").length < 16) throw new Error("Set OPENWA_WEBHOOK_SECRET before enabling WhatsApp in production");
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
  if (!input.enabled) {
    await db.collection("whatsappMessageAttempts").updateMany(
      { status: { $in: ["queued", "retry_wait"] } },
      { $set: { status: "cancelled", errorCategory: "integration_disabled", updatedAt: now }, $unset: { encryptedPayload: "", nextAttemptAt: "" } },
    );
  }
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

export async function enqueueOpenWaText(db: Db, phone: string, message: string, options: { type: string; recipientType?: string; recipientId?: string; senderOwnerId?: string; notificationId?: string; idempotencyKey?: string; authorizedTest?: boolean } = { type: "notification" }) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized || !/^\d{10,15}$/.test(normalized)) return { success: false as const, status: "rejected" as const, error: "Invalid phone number" };
  if (!message.trim() || message.length > 4096) return { success: false as const, status: "rejected" as const, error: "Message must contain 1–4096 characters" };
  if (!options.authorizedTest) {
    const entityType = options.recipientType === "owner" ? "owner" : options.recipientType === "tenant" ? "tenant" : null;
    if (!entityType || !options.recipientId || !ObjectId.isValid(options.recipientId)) return { success: false as const, status: "skipped_consent" as const, error: "Recipient identity is required to verify WhatsApp consent" };
    const consentPhoneHash = hashWhatsAppConsentPhone(normalized);
    const consent = await db.collection("whatsappPreferences").findOne({ entityType, entityId: new ObjectId(options.recipientId), enabled: true, consentPhoneHash }, { projection: { _id: 1 } });
    if (!consent) return { success: false as const, status: "skipped_consent" as const, error: "Recipient has not opted in to WhatsApp notifications" };
  }
  const id = new ObjectId();
  const now = new Date();
  const attempts = db.collection("whatsappMessageAttempts");
  const idempotencyKey = options.idempotencyKey || id.toHexString();
  try {
    const inserted = await attempts.updateOne(
      { idempotencyKey },
      { $setOnInsert: {
        _id: id,
        idempotencyKey,
        type: options.type,
        recipientType: options.recipientType || "unknown",
        recipientId: options.recipientId || null,
        ...(options.senderOwnerId ? {
          senderOwnerId: options.senderOwnerId,
          senderEnvironment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        } : {}),
        ...(options.notificationId ? { notificationId: options.notificationId } : {}),
        authorizedTest: options.authorizedTest === true,
        recipientMasked: `${normalized.slice(0, 3)}••••${normalized.slice(-3)}`,
        status: "queued",
        attempts: 0,
        nextAttemptAt: now,
        encryptedPayload: encryptWhatsAppApiKey(JSON.stringify({ phone: normalized, message })),
        createdAt: now,
        updatedAt: now,
      } },
      { upsert: true },
    );
    if (!inserted.upsertedCount) {
      if (options.notificationId) await attempts.updateOne({ idempotencyKey, notificationId: { $exists: false } }, { $set: { notificationId: options.notificationId, updatedAt: now } });
      const existing = await attempts.findOne({ idempotencyKey }, { projection: { _id: 1, status: 1 } });
      const messageId = existing && ["queued", "retry_wait"].includes(String(existing.status)) ? String(existing._id) : null;
      return { success: true as const, status: "duplicate" as const, messageId };
    }
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      if (options.notificationId) await attempts.updateOne({ idempotencyKey, notificationId: { $exists: false } }, { $set: { notificationId: options.notificationId, updatedAt: now } });
      const existing = await attempts.findOne({ idempotencyKey }, { projection: { _id: 1, status: 1 } });
      const messageId = existing && ["queued", "retry_wait"].includes(String(existing.status)) ? String(existing._id) : null;
      return { success: true as const, status: "duplicate" as const, messageId };
    }
    throw error;
  }
  return { success: true as const, status: "queued" as const, messageId: id.toHexString() };
}

export async function consumeWhatsAppAdminRateLimit(db: Db, key: string, maximum: number, windowMs: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const result = await db.collection<{ _id: string; windowStartedAt?: Date; count?: number; expiresAt?: Date }>("whatsappAdminRateLimits").findOneAndUpdate(
    { _id: key },
    [{ $set: {
      windowStartedAt: { $cond: [{ $gt: ["$windowStartedAt", cutoff] }, "$windowStartedAt", now] },
      count: { $cond: [{ $gt: ["$windowStartedAt", cutoff] }, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
      expiresAt: new Date(now.getTime() + windowMs * 2),
    } }],
    { upsert: true, returnDocument: "after" },
  );
  return Number(result?.count || 0) <= maximum;
}

export async function processOpenWaOutbox(db: Db, limit = 20, onlyAttemptId?: string) {
  const settings = await readWhatsAppSettings(db);
  const ownerGatewayConfigured = Boolean(process.env.OPENWA_PROVISIONING_KEY);
  if (settings?.enabled !== true && !ownerGatewayConfigured && !onlyAttemptId) return { processed: 0, paused: true };
  const attempts = db.collection("whatsappMessageAttempts");
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const filter: Record<string, any> = { status: { $in: ["queued", "retry_wait"] }, nextAttemptAt: { $lte: now } };
    if (!onlyAttemptId && settings?.enabled === true) {
      filter.$or = [
        { senderOwnerId: { $exists: false } },
        { senderOwnerId: { $type: "string" }, senderEnvironment: "production" },
      ];
    } else if (!onlyAttemptId && ownerGatewayConfigured) {
      filter.senderOwnerId = { $type: "string" };
      filter.senderEnvironment = "production";
    }
    if (onlyAttemptId && ObjectId.isValid(onlyAttemptId)) filter._id = new ObjectId(onlyAttemptId);
    const job = await attempts.findOneAndUpdate(
      filter,
      { $set: { status: "processing", lockedAt: now, updatedAt: now } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: "after" },
    );
    if (!job) break;
    const attemptNumber = Number(job.attempts || 0) + 1;
    try {
      const payload = JSON.parse(decryptWhatsAppApiKey(String(job.encryptedPayload || ""))) as { phone?: string; message?: string };
      if (!payload.phone || !payload.message) throw new Error("Invalid queued message payload");
      if (job.authorizedTest !== true) {
        const entityType = job.recipientType === "owner" ? "owner" : job.recipientType === "tenant" ? "tenant" : null;
        const recipientId = typeof job.recipientId === "string" ? job.recipientId : "";
        const consentPhoneHash = hashWhatsAppConsentPhone(payload.phone);
        const optedIn = entityType && ObjectId.isValid(recipientId)
          ? await db.collection("whatsappPreferences").findOne({ entityType, entityId: new ObjectId(recipientId), enabled: true, consentPhoneHash }, { projection: { _id: 1 } })
          : null;
        if (!optedIn) {
          await attempts.updateOne({ _id: job._id, status: "processing" }, { $set: { status: "cancelled", errorCategory: "consent_revoked_or_phone_changed", updatedAt: new Date() }, $unset: { encryptedPayload: "", lockedAt: "", nextAttemptAt: "" } });
          if (typeof job.notificationId === "string") await updateLinkedNotificationDeliveryStatus(db, job.notificationId, "failed", "WhatsApp consent was revoked or the phone number changed.");
          processed += 1;
          continue;
        }
      }
      const request = typeof job.senderOwnerId === "string"
        ? (path: string, init: RequestInit) => requestOwnerWhatsApp(db, job.senderOwnerId, path, init)
        : (path: string, init: RequestInit) => requestGateway(db, path, init);
      const body = await request("/messages/send-text", {
        method: "POST",
        headers: { "Idempotency-Key": String(job.idempotencyKey) },
        body: JSON.stringify({ chatId: `${payload.phone}@c.us`, text: payload.message }),
      });
      const gatewayMessageId = typeof body.id === "string" ? body.id : typeof body.messageId === "string" ? body.messageId : null;
      await attempts.updateOne({ _id: job._id, status: "processing" }, { $set: { status: "submitted", gatewayMessageId, attempts: attemptNumber, lastAttemptAt: now, updatedAt: new Date() }, $unset: { encryptedPayload: "", lockedAt: "", nextAttemptAt: "" } });
      if (gatewayMessageId) await applyStoredOpenWaDeliveryState(db, gatewayMessageId);
    } catch (error) {
      const httpStatus = error instanceof Error ? Number(error.message.match(/OpenWA request failed \((\d+)\)/)?.[1]) : 0;
      const uncertain = (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error instanceof TypeError || error.message === "OpenWA returned an invalid response")) || httpStatus >= 500;
      if (httpStatus === 429 && attemptNumber < 4) {
        const delayMs = [60_000, 5 * 60_000, 15 * 60_000][attemptNumber - 1] || 15 * 60_000;
        await attempts.updateOne({ _id: job._id, status: "processing" }, { $set: { status: "retry_wait", attempts: attemptNumber, nextAttemptAt: new Date(now.getTime() + delayMs), lastAttemptAt: now, errorCategory: "rate_limited", updatedAt: new Date() }, $unset: { lockedAt: "" } });
      } else {
        await attempts.updateOne({ _id: job._id, status: "processing" }, { $set: { status: uncertain ? "unknown" : "failed", attempts: attemptNumber, lastAttemptAt: now, errorCategory: uncertain ? "submission_outcome_unknown" : httpStatus ? `gateway_http_${httpStatus}` : "invalid_queued_payload", updatedAt: new Date() }, $unset: { encryptedPayload: "", lockedAt: "", nextAttemptAt: "" } });
        if (!uncertain && typeof job.notificationId === "string") await updateLinkedNotificationDeliveryStatus(db, job.notificationId, "failed", "WhatsApp message could not be submitted.");
      }
    }
    processed += 1;
  }
  // A crashed worker during an HTTP send has an uncertain outcome; never replay it automatically.
  const staleBefore = new Date(Date.now() - 2 * REQUEST_TIMEOUT_MS);
  await attempts.updateMany({ status: "processing", lockedAt: { $lt: staleBefore } }, { $set: { status: "unknown", errorCategory: "worker_interrupted_outcome_unknown", updatedAt: new Date() }, $unset: { encryptedPayload: "", lockedAt: "", nextAttemptAt: "" } });
  return { processed };
}

export function verifyOpenWaWebhookSignature(rawBody: Buffer, signature: string | null, secret: string) {
  if (!signature || !secret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && crypto.timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function applyOpenWaDeliveryEvent(db: Db, event: unknown, deliveryHeaderId?: string | null) {
  if (!event || typeof event !== "object") return { accepted: false, reason: "invalid_event" };
  const value = event as Record<string, unknown>;
  const eventType = typeof value.event === "string" ? value.event : "";
  if (!new Set(["message.ack", "message.failed", "message.received"]).has(eventType)) return { accepted: false, reason: "unsupported_event" };
  if (!value.data || typeof value.data !== "object") return { accepted: false, reason: "invalid_payload" };
  const data = value.data as Record<string, unknown>;
  if (eventType === "message.received") {
    const source = [data.from, data.chatId, data.sender].find((candidate) => typeof candidate === "string") as string | undefined;
    const text = [data.body, data.text, data.content].find((candidate) => typeof candidate === "string") as string | undefined;
    const command = (text || "").trim().toUpperCase();
    if (!source || !/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(command)) return { accepted: true, ignored: true };
    const phone = normalizeWhatsAppPhone(source.replace(/@(?:c\.us|s\.whatsapp\.net)$/i, ""));
    if (!phone) return { accepted: true, ignored: true };
    const deliveryId = deliveryHeaderId || (typeof value.idempotencyKey === "string" ? value.idempotencyKey : typeof value.deliveryId === "string" ? value.deliveryId : "");
    if (!deliveryId || deliveryId.length > 255) return { accepted: false, reason: "missing_event_id" };
    try {
      const receivedAt = new Date();
      await db.collection("whatsappDeliveryEvents").insertOne({ deliveryId, eventType, status: "opt_out", recipientMasked: `${phone.slice(0, 3)}••••${phone.slice(-3)}`, receivedAt, expiresAt: new Date(receivedAt.getTime() + 90 * 24 * 60 * 60_000) });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) return { accepted: true, duplicate: true };
      throw error;
    }
    const phoneForms = new Set([phone]);
    if (phone.startsWith("254") && phone.length === 12) {
      phoneForms.add(`0${phone.slice(3)}`);
      phoneForms.add(phone.slice(3));
    }
    const phonePatterns = [...phoneForms].map((form) => ({ $regexMatch: { input: { $convert: { input: "$phone", to: "string", onError: "", onNull: "" } }, regex: `^\\D*${form.split("").join("\\D*")}\\D*$` } }));
    const matchingPhone = { $expr: { $or: phonePatterns } };
    const [tenants, owners] = await Promise.all([
      db.collection("tenants").find(matchingPhone, { projection: { _id: 1 } }).toArray(),
      db.collection("propertyOwners").find(matchingPhone, { projection: { _id: 1 } }).toArray(),
    ]);
    const now = new Date();
    const preferences = db.collection("whatsappPreferences");
    const updates = [
      ...tenants.map(async (item) => {
        await preferences.updateOne({ entityType: "tenant", entityId: item._id }, { $set: { enabled: false, revokedAt: now, updatedAt: now, revocationSource: "whatsapp_stop_keyword" } });
        await cancelWhatsAppRecipientOutbox(db, "tenant", item._id);
      }),
      ...owners.map(async (item) => {
        await preferences.updateOne({ entityType: "owner", entityId: item._id }, { $set: { enabled: false, revokedAt: now, updatedAt: now, revocationSource: "whatsapp_stop_keyword" } });
        await cancelWhatsAppRecipientOutbox(db, "owner", item._id);
      }),
    ];
    await Promise.all(updates);
    await db.collection("auditLogs").insertOne({ action: "whatsapp_consent_revoked_by_keyword", recipientMasked: `${phone.slice(0, 3)}••••${phone.slice(-3)}`, affectedTenants: tenants.length, affectedOwners: owners.length, timestamp: now.toISOString() });
    return { accepted: true, optOut: true, affectedRecipients: tenants.length + owners.length };
  }
  const gatewayMessageId = typeof data.id === "string" ? data.id : typeof data.messageId === "string" ? data.messageId : "";
  if (!gatewayMessageId || gatewayMessageId.length > 255) return { accepted: false, reason: "missing_message_id" };
  const suppliedStatus = typeof data.status === "string" ? data.status.toLowerCase() : typeof data.ackName === "string" ? data.ackName.toLowerCase() : "";
  const ack = typeof data.ack === "number" ? data.ack : null;
  const nextStatus = eventType === "message.failed" || suppliedStatus === "failed" || ack === -1
    ? "failed"
    : ["read", "played"].includes(suppliedStatus) || ack === 3 || ack === 4
      ? "read"
      : suppliedStatus === "delivered" || ack === 2
        ? "delivered"
        : suppliedStatus === "sent" || ack === 1
          ? "sent"
          : null;
  if (!nextStatus) return { accepted: false, reason: "unsupported_status" };
  const deliveryId = deliveryHeaderId || (typeof value.deliveryId === "string" ? value.deliveryId : typeof value.idempotencyKey === "string" ? value.idempotencyKey : "");
  if (!deliveryId || deliveryId.length > 255) return { accepted: false, reason: "missing_event_id" };
  const events = db.collection("whatsappDeliveryEvents");
  try {
    const receivedAt = new Date();
    await events.insertOne({ deliveryId, eventType, gatewayMessageId, status: nextStatus, receivedAt, expiresAt: new Date(receivedAt.getTime() + 90 * 24 * 60 * 60_000) });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return { accepted: true, duplicate: true };
    throw error;
  }
  const applied = await applyStoredOpenWaDeliveryState(db, gatewayMessageId);
  return { accepted: true, ...applied };
}

async function applyStoredOpenWaDeliveryState(db: Db, gatewayMessageId: string) {
  const current = await db.collection("whatsappMessageAttempts").findOne({ gatewayMessageId }, { projection: { _id: 1, status: 1, notificationId: 1 } });
  if (!current) return { matched: false };
  const events = await db.collection("whatsappDeliveryEvents").find({ gatewayMessageId }, { projection: { status: 1 } }).sort({ receivedAt: 1 }).toArray();
  const order: Record<string, number> = { queued: 0, retry_wait: 0, processing: 0, submitted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
  let nextStatus = String(current.status);
  for (const event of events) {
    const eventStatus = String(event.status);
    if (!["sent", "delivered", "read", "failed"].includes(eventStatus) || nextStatus === "failed") continue;
    if (eventStatus === "failed" && (nextStatus === "delivered" || nextStatus === "read")) continue;
    if ((order[eventStatus] || 0) > (order[nextStatus] || 0)) nextStatus = eventStatus;
  }
  const changed = nextStatus !== current.status;
  if (changed) {
    const now = new Date();
    await db.collection("whatsappMessageAttempts").updateOne({ _id: current._id }, { $set: { status: nextStatus, deliveryStatusAt: now, updatedAt: now, ...(nextStatus === "failed" ? { errorCategory: "provider_delivery_failed" } : {}) } });
  }
  if (typeof current.notificationId === "string" && ["sent", "delivered", "read"].includes(nextStatus)) {
    await updateLinkedNotificationDeliveryStatus(db, current.notificationId, "success");
  } else if (typeof current.notificationId === "string" && nextStatus === "failed") {
    await updateLinkedNotificationDeliveryStatus(db, current.notificationId, "failed", "WhatsApp delivery failed.");
  }
  return { matched: true, changed };
}

async function updateLinkedNotificationDeliveryStatus(db: Db, notificationId: string, deliveryStatus: "success" | "failed", errorDetails?: string) {
  const id = ObjectId.isValid(notificationId) ? new ObjectId(notificationId) : notificationId;
  await db.collection("notifications").updateOne(
    { _id: id as any, deliveryStatus: "pending" },
    { $set: { deliveryStatus, ...(deliveryStatus === "failed" ? { errorDetails } : { errorDetails: null }), updatedAt: new Date().toISOString() } },
  );
}

export async function syncOpenWaNotificationStatus(db: Db, notificationId: string) {
  const attempts = await db.collection("whatsappMessageAttempts").find({ notificationId }, { projection: { status: 1 } }).toArray();
  if (!attempts.length) return;
  const statuses = attempts.map((attempt) => String(attempt.status));
  if (statuses.some((status) => ["failed", "cancelled"].includes(status))) {
    await updateLinkedNotificationDeliveryStatus(db, notificationId, "failed", "WhatsApp delivery failed.");
  } else if (statuses.every((status) => ["sent", "delivered", "read"].includes(status))) {
    await updateLinkedNotificationDeliveryStatus(db, notificationId, "success");
  }
}

export async function cancelWhatsAppRecipientOutbox(db: Db, entityType: "tenant" | "owner", entityId: ObjectId) {
  const recipientType = entityType === "owner" ? "owner" : "tenant";
  return db.collection("whatsappMessageAttempts").updateMany(
    { recipientType, recipientId: entityId.toHexString(), status: { $in: ["queued", "retry_wait"] } },
    { $set: { status: "cancelled", errorCategory: "consent_revoked", updatedAt: new Date() }, $unset: { encryptedPayload: "", nextAttemptAt: "" } },
  );
}

export async function listRecentWhatsAppAttempts(db: Db, limit = 50) {
  return db.collection("whatsappMessageAttempts").find({}, { projection: { recipientMasked: 1, type: 1, status: 1, gatewayMessageId: 1, errorCategory: 1, attempts: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).limit(limit).toArray();
}

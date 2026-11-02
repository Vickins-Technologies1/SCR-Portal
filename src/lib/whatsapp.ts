import "server-only";
import { ObjectId } from "mongodb";
import logger from "./logger";
import { connectToDatabase } from "./mongodb";
import { enqueueOpenWaText, readWhatsAppSettings } from "./whatsapp-gateway";
import { readOwnerWhatsApp } from "./owner-whatsapp";
import { normalizeWhatsAppPhone } from "./listing-contact";
import { hashWhatsAppConsentPhone } from "./whatsapp-crypto";

interface SendWhatsAppOptions { phone: string | string[]; message: string; type?: string; idempotencyKey?: string; recipientType?: "tenant" | "owner"; recipientId?: string; notificationId?: string; }

function normalizeLegacyPhone(value: string) {
  const cleaned = value.replace(/[^\d+]/g, "");
  let digits = cleaned.replace(/\+/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  else if (digits.startsWith("7") || digits.startsWith("1")) digits = `254${digits}`;
  return /^\d{10,15}$/.test(digits) ? `+${digits}` : null;
}

async function sendLegacyApiWap(phone: string, message: string) {
  const token = process.env.APIWAP_TOKEN;
  if (!token) return { success: false, error: { code: 1003, message: "WhatsApp is disabled or not configured" } };
  const phoneNumber = normalizeLegacyPhone(phone);
  if (!phoneNumber) return { success: false, error: { code: 1004, message: "Invalid phone number" } };
  try {
    const response = await fetch("https://api.apiwap.com/api/v1/whatsapp/send-message", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, message, type: "text" }),
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, error: { code: response.status, message: "WhatsApp provider rejected the request" } };
    const responseMessage = typeof result?.message === "string" ? result.message : "";
    return responseMessage.toLowerCase().includes("successfully")
      ? { success: true }
      : { success: false, error: { code: 0, message: "Unexpected WhatsApp provider response" } };
  } catch {
    return { success: false, error: { code: 1000, message: "WhatsApp provider unavailable" } };
  }
}

export async function sendWhatsAppMessage({ phone, message, type = "notification", idempotencyKey, recipientType, recipientId, notificationId }: SendWhatsAppOptions): Promise<{ success: boolean; status?: string; error?: { code: number; message: string } }> {
  if (!phone || !message || message.length > 4096) return { success: false, error: { code: 1001, message: "Invalid WhatsApp message" } };
  const { db } = await connectToDatabase();
  const settings = await readWhatsAppSettings(db);
  const recipients = Array.isArray(phone) ? phone : [phone];
  if (!recipientType || !recipientId || !ObjectId.isValid(recipientId)) return { success: false, status: "skipped_consent", error: { code: 1005, message: "Recipient identity is required to verify WhatsApp consent" } };
  const preference = await db.collection("whatsappPreferences").findOne({
    entityType: recipientType === "owner" ? "owner" : "tenant",
    entityId: new ObjectId(recipientId),
    enabled: true,
  }, { projection: { consentPhoneHash: 1 } });
  const consentPhoneHash = typeof preference?.consentPhoneHash === "string" ? preference.consentPhoneHash : "";
  const consentedRecipients = recipients.filter((recipient) => {
    const normalized = normalizeWhatsAppPhone(recipient);
    return normalized && hashWhatsAppConsentPhone(normalized) === consentPhoneHash;
  });
  if (!consentPhoneHash || !consentedRecipients.length || consentedRecipients.length !== recipients.length) return { success: false, status: "skipped_consent", error: { code: 1005, message: "Recipient has not opted in to WhatsApp notifications for this phone number" } };

  if (recipientType === "tenant") {
    if (process.env.VERCEL_ENV === "preview") return { success: false, status: "skipped_preview", error: { code: 1003, message: "Tenant WhatsApp delivery is disabled on Preview deployments" } };
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(recipientId) }, { projection: { ownerId: 1 } });
    const senderOwnerId = String(tenant?.ownerId || "");
    if (!ObjectId.isValid(senderOwnerId)) return { success: false, status: "skipped_owner_whatsapp_not_connected", error: { code: 1003, message: "This property owner has not connected WhatsApp" } };
    const integration = await readOwnerWhatsApp(db, senderOwnerId);
    if (integration?.enabled !== true || integration.status !== "ready") {
      return { success: false, status: "skipped_owner_whatsapp_not_connected", error: { code: 1003, message: "This property owner has not connected WhatsApp" } };
    }
    let allSuccess = true;
    let finalStatus = "queued";
    for (const [index, recipient] of recipients.entries()) {
      const result = await enqueueOpenWaText(db, recipient, message, {
        type,
        recipientType,
        recipientId,
        senderOwnerId,
        notificationId,
        idempotencyKey: recipients.length > 1 && idempotencyKey ? `${idempotencyKey}:${index}` : idempotencyKey,
      });
      if (!result.success) allSuccess = false;
      if (result.status === "duplicate") finalStatus = "duplicate";
    }
    return allSuccess
      ? { success: true, status: finalStatus }
      : { success: false, status: "failed", error: { code: 1000, message: "WhatsApp message could not be queued" } };
  }

  if (settings?.enabled) {
    let allSuccess = true;
    let finalStatus = "queued";
    for (const [index, recipient] of recipients.entries()) {
      const result = await enqueueOpenWaText(db, recipient, message, { type, recipientType, recipientId, notificationId, idempotencyKey: recipients.length > 1 && idempotencyKey ? `${idempotencyKey}:${index}` : idempotencyKey });
      if (!result.success) allSuccess = false;
      if (result.status === "skipped_consent") finalStatus = result.status;
      else if (result.status === "duplicate" && finalStatus !== "skipped_consent") finalStatus = "duplicate";
    }
    return { success: allSuccess, status: allSuccess ? finalStatus : finalStatus === "skipped_consent" ? finalStatus : "failed", ...(!allSuccess ? { error: { code: 1000, message: finalStatus === "skipped_consent" ? "Recipient has not opted in to WhatsApp notifications" : "WhatsApp message could not be queued" } } : {}) };
  }

  // An administrator-created settings record is the explicit channel switch.
  // An absent record preserves the pre-integration ApiWap behavior.
  if (settings) return { success: false, status: "disabled", error: { code: 1003, message: "WhatsApp notifications are disabled" } };

  // Keep the existing ApiWap path operating for installs that already configured it.
  const results = await Promise.all(recipients.map((recipient) => sendLegacyApiWap(recipient, message)));
  const failed = results.find((result) => !result.success);
  if (failed) logger.warn("Legacy WhatsApp submission failed", { errorCode: failed.error?.code });
  return failed || results.length === 0 ? { success: false, error: failed?.error || { code: 1003, message: "No recipient configured" } } : { success: true, status: "submitted" };
}

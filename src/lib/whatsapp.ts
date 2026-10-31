import "server-only";
import logger from "./logger";
import { connectToDatabase } from "./mongodb";
import { readWhatsAppSettings, sendOpenWaText } from "./whatsapp-gateway";

interface SendWhatsAppOptions { phone: string | string[]; message: string; type?: string; idempotencyKey?: string; }

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

export async function sendWhatsAppMessage({ phone, message, type = "notification", idempotencyKey }: SendWhatsAppOptions): Promise<{ success: boolean; status?: string; error?: { code: number; message: string } }> {
  if (!phone || !message || message.length > 4096) return { success: false, error: { code: 1001, message: "Invalid WhatsApp message" } };
  const { db } = await connectToDatabase();
  const settings = await readWhatsAppSettings(db);
  if (settings?.enabled) {
    const recipients = Array.isArray(phone) ? phone : [phone];
    let allSuccess = true;
    for (const recipient of recipients) {
      const result = await sendOpenWaText(db, recipient, message, { type, idempotencyKey });
      if (!result.success) allSuccess = false;
    }
    return { success: allSuccess, status: allSuccess ? "submitted" : "failed", ...(!allSuccess ? { error: { code: 1000, message: "WhatsApp submission failed; inspect the admin message history" } } : {}) };
  }

  // An administrator-created settings record is the explicit channel switch.
  // An absent record preserves the pre-integration ApiWap behavior.
  if (settings) return { success: false, status: "disabled", error: { code: 1003, message: "WhatsApp notifications are disabled" } };

  // Keep the existing ApiWap path operating for installs that already configured it.
  const recipients = Array.isArray(phone) ? phone : [phone];
  const results = await Promise.all(recipients.map((recipient) => sendLegacyApiWap(recipient, message)));
  const failed = results.find((result) => !result.success);
  if (failed) logger.warn("Legacy WhatsApp submission failed", { errorCode: failed.error?.code });
  return failed || results.length === 0 ? { success: false, error: failed?.error || { code: 1003, message: "No recipient configured" } } : { success: true, status: "submitted" };
}

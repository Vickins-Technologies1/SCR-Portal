import "server-only";
import crypto from "node:crypto";

function encryptionKey() {
  const encoded = process.env.WHATSAPP_ENCRYPTION_KEY || "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("WHATSAPP_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function hashWhatsAppConsentPhone(normalizedPhone: string) {
  const secret = process.env.WHATSAPP_CONSENT_SECRET || process.env.JWT_SECRET || "";
  if (secret.length < 32) throw new Error("WHATSAPP_CONSENT_SECRET must contain at least 32 characters");
  return crypto.createHmac("sha256", secret).update(normalizedPhone).digest("hex");
}

export function encryptWhatsAppApiKey(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptWhatsAppApiKey(value: string) {
  const [ivPart, tagPart, ciphertextPart] = value.split(":");
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error("Invalid encrypted WhatsApp API key");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64")), decipher.final()]).toString("utf8");
}

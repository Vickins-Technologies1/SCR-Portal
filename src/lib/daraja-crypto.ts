import "server-only";
import crypto from "crypto";

const DARAJA_ENCRYPTION_SECRET = process.env.MPESA_ENCRYPTION_SECRET || process.env.DARAJA_ENCRYPTION_SECRET || "";

function requireSecret(): Buffer {
  if (!DARAJA_ENCRYPTION_SECRET) {
    throw new Error("Missing required env: MPESA_ENCRYPTION_SECRET");
  }

  const key = Buffer.from(DARAJA_ENCRYPTION_SECRET, "utf8");
  if (key.length !== 32) {
    throw new Error("MPESA_ENCRYPTION_SECRET must be exactly 32 characters for AES-256-CBC");
  }

  return key;
}

function isBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length > 0 && buf.toString("base64") === value.replace(/\s+/g, "");
  } catch {
    return false;
  }
}

export function isLikelyEncryptedDarajaSecret(value: string): boolean {
  const trimmed = (value || "").trim();
  if (!trimmed) return false;
  const parts = trimmed.split(":");
  if (parts.length !== 2) return false;
  return isBase64(parts[0]) && isBase64(parts[1]);
}

export function encryptDarajaSecret(text: string): string {
  const key = requireSecret();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptDarajaSecret(encrypted: string): string {
  const key = requireSecret();
  const [ivPart, dataPart] = (encrypted || "").split(":");
  if (!ivPart || !dataPart) throw new Error("Invalid encrypted Daraja secret format");

  const iv = Buffer.from(ivPart, "base64");
  const encryptedBuf = Buffer.from(dataPart, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
  return decrypted.toString("utf8");
}


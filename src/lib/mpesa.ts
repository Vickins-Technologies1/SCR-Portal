// src/lib/mpesa.ts
import "server-only";
import crypto from "crypto";

export type MpesaEnvironment = "sandbox" | "production";

const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "";
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "";
const MPESA_ENVIRONMENT = (process.env.MPESA_ENVIRONMENT || "sandbox") as MpesaEnvironment;
const MPESA_ENCRYPTION_SECRET = process.env.MPESA_ENCRYPTION_SECRET || "";
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "";
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || "";
const KOPOKOPO_TILL_NUMBER = process.env.KOPOKOPO_TILL_NUMBER || "";
const KOPOKOPO_PASSKEY = process.env.KOPOKOPO_PASSKEY || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`Missing required env: ${name}`);
}

export function getMpesaBaseUrl(): string {
  return MPESA_ENVIRONMENT === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";
}

export function generateTimestamp(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export function getMpesaShortcode(): string {
  requireEnv("MPESA_SHORTCODE", MPESA_SHORTCODE);
  return MPESA_SHORTCODE;
}

export function getMpesaPasskey(): string {
  requireEnv("MPESA_PASSKEY", MPESA_PASSKEY);
  return MPESA_PASSKEY;
}

export function getKopokopoTillNumber(): string {
  requireEnv("KOPOKOPO_TILL_NUMBER", KOPOKOPO_TILL_NUMBER);
  return KOPOKOPO_TILL_NUMBER;
}

export function getKopokopoPasskey(): string {
  if (KOPOKOPO_PASSKEY) return KOPOKOPO_PASSKEY;
  return getMpesaPasskey();
}

export function encryptPasskey(text: string): string {
  requireEnv("MPESA_ENCRYPTION_SECRET", MPESA_ENCRYPTION_SECRET);
  const key = Buffer.from(MPESA_ENCRYPTION_SECRET, "utf8");
  if (key.length !== 32) {
    throw new Error("MPESA_ENCRYPTION_SECRET must be exactly 32 characters for AES-256-CBC");
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptPasskey(encrypted: string): string {
  requireEnv("MPESA_ENCRYPTION_SECRET", MPESA_ENCRYPTION_SECRET);
  const key = Buffer.from(MPESA_ENCRYPTION_SECRET, "utf8");
  if (key.length !== 32) {
    throw new Error("MPESA_ENCRYPTION_SECRET must be exactly 32 characters for AES-256-CBC");
  }

  const [ivPart, dataPart] = encrypted.split(":");
  if (!ivPart || !dataPart) throw new Error("Invalid encrypted passkey format");

  const iv = Buffer.from(ivPart, "base64");
  const encryptedBuf = Buffer.from(dataPart, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function getAccessToken(): Promise<string> {
  requireEnv("MPESA_CONSUMER_KEY", MPESA_CONSUMER_KEY);
  requireEnv("MPESA_CONSUMER_SECRET", MPESA_CONSUMER_SECRET);

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const baseUrl = getMpesaBaseUrl();
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch access token (HTTP ${res.status})`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!data.access_token) throw new Error("Invalid access token response");

  const expiresInSec = typeof data.expires_in === "string" ? parseInt(data.expires_in, 10) : data.expires_in || 3599;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInSec * 1000,
  };

  return data.access_token;
}

export function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/\D/g, "");
  if (normalized.startsWith("07")) normalized = `254${normalized.slice(1)}`;
  if (normalized.startsWith("01")) normalized = `254${normalized.slice(1)}`;
  if (normalized.startsWith("+254")) normalized = normalized.slice(1);
  return normalized;
}

export function isValidKenyanMsisdn(phone: string): boolean {
  return /^254[17]\d{8}$/.test(phone);
}

export type MpesaStkTransactionType = "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";

export async function initiateStkPush(params: {
  shortcode: string;
  passkey: string;
  amount: number;
  phone: string;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
  transactionType?: MpesaStkTransactionType;
}): Promise<{
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}> {
  const token = await getAccessToken();
  const timestamp = generateTimestamp();
  const password = generatePassword(params.shortcode, params.passkey, timestamp);
  const baseUrl = getMpesaBaseUrl();

  const payload = {
    BusinessShortCode: params.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: params.transactionType || "CustomerPayBillOnline",
    Amount: params.amount,
    PartyA: params.phone,
    PartyB: params.shortcode,
    PhoneNumber: params.phone,
    CallBackURL: params.callbackUrl,
    AccountReference: params.accountReference,
    TransactionDesc: params.transactionDesc,
  };

  const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    const errorMessage = data?.errorMessage || data?.error?.message || "STK Push failed";
    throw new Error(errorMessage);
  }

  return data;
}

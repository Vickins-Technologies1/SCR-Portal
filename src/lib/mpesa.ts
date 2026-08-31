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

let cachedToken: { token: string; expiresAt: number; key: string } | null = null;

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`Missing required env: ${name}`);
}

export function getMpesaBaseUrl(environment: MpesaEnvironment = MPESA_ENVIRONMENT): string {
  return environment === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";
}

export function getMpesaCallbackUrl(path = "/api/mpesa/stk-callback"): string {
  const base = (process.env.MPESA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("Missing required env: MPESA_CALLBACK_BASE_URL");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (MPESA_ENVIRONMENT === "production" && url.protocol !== "https:") {
    throw new Error("MPESA_CALLBACK_BASE_URL must use HTTPS in production");
  }
  return url.toString();
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

export function resolvePlatformStkCredentials(): {
  shortcode: string;
  passkey: string;
  source: "kopokopo" | "mpesa";
} {
  if (KOPOKOPO_TILL_NUMBER && KOPOKOPO_PASSKEY) {
    return {
      shortcode: KOPOKOPO_TILL_NUMBER,
      passkey: KOPOKOPO_PASSKEY,
      source: "kopokopo",
    };
  }

  if (MPESA_SHORTCODE && MPESA_PASSKEY) {
    return {
      shortcode: MPESA_SHORTCODE,
      passkey: MPESA_PASSKEY,
      source: "mpesa",
    };
  }

  throw new Error(
    "Missing payment credentials. Configure KOPOKOPO_TILL_NUMBER/KOPOKOPO_PASSKEY or MPESA_SHORTCODE/MPESA_PASSKEY."
  );
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

export async function getAccessToken(credentials?: {
  consumerKey?: string;
  consumerSecret?: string;
  environment?: MpesaEnvironment;
}): Promise<string> {
  const consumerKey = credentials?.consumerKey || MPESA_CONSUMER_KEY;
  const consumerSecret = credentials?.consumerSecret || MPESA_CONSUMER_SECRET;
  const environment = credentials?.environment || MPESA_ENVIRONMENT;
  requireEnv("MPESA_CONSUMER_KEY", consumerKey);
  requireEnv("MPESA_CONSUMER_SECRET", consumerSecret);

  const now = Date.now();
  const cacheKey = `${environment}:${consumerKey}`;
  if (cachedToken && cachedToken.expiresAt > now + 60_000 && cachedToken.key === cacheKey) {
    return cachedToken.token;
  }

  const baseUrl = getMpesaBaseUrl(environment);
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
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
    key: cacheKey,
  };

  return data.access_token;
}

export function normalizePhoneNumber(phone: string): string {
  let normalized = phone.trim().replace(/\D/g, "");
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
  consumerKey?: string;
  consumerSecret?: string;
  environment?: MpesaEnvironment;
}): Promise<{
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}> {
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) {
    throw new Error("STK amount must be a positive whole number");
  }
  if (!isValidKenyanMsisdn(params.phone)) {
    throw new Error("Invalid Kenyan phone number");
  }
  if (!params.accountReference.trim() || !params.transactionDesc.trim()) {
    throw new Error("STK account reference and transaction description are required");
  }
  const token = await getAccessToken(params);
  const timestamp = generateTimestamp();
  const password = generatePassword(params.shortcode, params.passkey, timestamp);
  const baseUrl = getMpesaBaseUrl(params.environment);

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Daraja STK request timed out");
    throw new Error("Unable to reach Daraja STK service");
  } finally {
    clearTimeout(timeout);
  }

  let data: any = {};
  try { data = await res.json(); } catch { /* handled below with a safe generic error */ }
  if (!res.ok) {
    throw new Error("Daraja STK request failed");
  }

  return data;
}

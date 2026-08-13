import "server-only";
import * as crypto from "crypto";

function readEnv(name: string): string {
  const value = process.env[name] || "";
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

const KOPOKOPO_ENVIRONMENT = readEnv("KOPOKOPO_ENVIRONMENT").toLowerCase() === "production" ? "production" : "sandbox";
const KOPOKOPO_OAUTH_BASE_URL = readEnv("KOPOKOPO_OAUTH_BASE_URL") || readEnv("KOPOKOPO_AUTH_BASE_URL");
const KOPOKOPO_API_BASE_URL = (
  readEnv("KOPOKOPO_API_BASE_URL") ||
  (KOPOKOPO_OAUTH_BASE_URL.includes("app.kopokopo.com") || KOPOKOPO_ENVIRONMENT === "production"
    ? "https://api.kopokopo.com"
    : "https://sandbox.kopokopo.com")
).replace(/\/$/, "");
const KOPOKOPO_AUTH_BASE_URL =
  KOPOKOPO_OAUTH_BASE_URL ||
  (KOPOKOPO_ENVIRONMENT === "production" ? "https://app.kopokopo.com" : "https://sandbox.kopokopo.com");
const KOPOKOPO_CLIENT_ID = readEnv("KOPOKOPO_CLIENT_ID");
const KOPOKOPO_CLIENT_SECRET = readEnv("KOPOKOPO_CLIENT_SECRET") || readEnv("KOPOKOPO_PASSKEY");
const KOPOKOPO_API_KEY = readEnv("KOPOKOPO_API_KEY");
const KOPOKOPO_TILL_NUMBER = readEnv("KOPOKOPO_TILL_NUMBER");

type CachedToken = {
  token: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

function requireEnv(name: string, value: string) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
}

function normalizeStatus(value: unknown): "pending" | "completed" | "failed" {
  const normalized = String(value || "").trim().toLowerCase();
  if (["success", "received", "paid", "completed"].includes(normalized)) return "completed";
  if (["failed", "cancelled", "canceled", "reversed", "error"].includes(normalized)) return "failed";
  return "pending";
}

export function getKopokopoBaseUrl(): string {
  return KOPOKOPO_API_BASE_URL;
}

export function getKopokopoTillNumber(): string {
  requireEnv("KOPOKOPO_TILL_NUMBER", KOPOKOPO_TILL_NUMBER);
  return KOPOKOPO_TILL_NUMBER;
}

async function getAccessToken(): Promise<string> {
  requireEnv("KOPOKOPO_CLIENT_ID", KOPOKOPO_CLIENT_ID);
  requireEnv("KOPOKOPO_CLIENT_SECRET", KOPOKOPO_CLIENT_SECRET);

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: KOPOKOPO_CLIENT_ID,
    client_secret: KOPOKOPO_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const res = await fetch(`${KOPOKOPO_AUTH_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Sorana Rentals/1.0",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const suffix = text ? `: ${text}` : "";
    if (res.status === 401 && /invalid_client/i.test(text)) {
      throw new Error(
        `Failed to fetch KopoKopo access token (HTTP 401): invalid_client. Check KOPOKOPO_OAUTH_BASE_URL, KOPOKOPO_CLIENT_ID, and KOPOKOPO_CLIENT_SECRET (or KOPOKOPO_PASSKEY if you are using the legacy alias) for the same KopoKopo app.`
      );
    }
    throw new Error(`Failed to fetch KopoKopo access token (HTTP ${res.status})${suffix}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number | string };
  if (!data.access_token) {
    throw new Error("Invalid KopoKopo token response");
  }

  const expiresIn = typeof data.expires_in === "string" ? Number(data.expires_in) : data.expires_in || 3600;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return data.access_token;
}

export type KopokopoIncomingPaymentInput = {
  tillNumber: string;
  phoneNumber: string;
  amount: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  reference: string;
  notes?: string;
  callbackUrl: string;
  customerId?: string;
};

export type KopokopoIncomingPaymentResult = {
  id: string;
  location: string;
  status: "pending" | "completed" | "failed";
  customerMessage: string;
  raw: unknown;
};

export async function createIncomingPayment(input: KopokopoIncomingPaymentInput): Promise<KopokopoIncomingPaymentResult> {
  const accessToken = await getAccessToken();
  const payload = {
    payment_channel: "M-PESA STK Push",
    till_number: input.tillNumber,
    subscriber: {
      first_name: input.firstName || "",
      last_name: input.lastName || "",
      phone_number: input.phoneNumber,
      email: input.email || "",
    },
    amount: {
      currency: "KES",
      value: input.amount,
    },
    metadata: {
      customer_id: input.customerId || input.reference,
      reference: input.reference,
      notes: input.notes || `Payment for ${input.reference}`,
    },
    _links: {
      callback_url: input.callbackUrl,
    },
  };

  const res = await fetch(`${KOPOKOPO_API_BASE_URL}/api/v2/incoming_payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Sorana Rentals/1.0",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = text;
  }

  if (!res.ok && res.status !== 201) {
    const message =
      typeof raw === "object" && raw && "error_message" in raw
        ? String((raw as { error_message?: string }).error_message || "KopoKopo payment initiation failed")
        : "KopoKopo payment initiation failed";
    throw new Error(message);
  }

  const location = res.headers.get("location") || "";
  const idFromLocation = location.split("/").filter(Boolean).pop() || "";
  const id =
    idFromLocation ||
    (typeof raw === "object" && raw && "data" in raw && typeof (raw as { data?: { id?: string } }).data?.id === "string"
      ? (raw as { data?: { id?: string } }).data?.id || ""
      : "");

  if (!id) {
    throw new Error("KopoKopo did not return a payment request ID");
  }

  return {
    id,
    location: location || `${KOPOKOPO_API_BASE_URL}/api/v2/incoming_payments/${id}`,
    status: "pending",
    customerMessage: "STK Push initiated. Check your phone.",
    raw,
  };
}

export async function getIncomingPaymentStatus(paymentId: string): Promise<{
  status: "pending" | "completed" | "failed";
  raw: unknown;
  reference?: string;
  receipt?: string;
}> {
  requireEnv("KOPOKOPO_CLIENT_ID", KOPOKOPO_CLIENT_ID);
  requireEnv("KOPOKOPO_CLIENT_SECRET", KOPOKOPO_CLIENT_SECRET);

  if (!paymentId.trim()) {
    throw new Error("Missing KopoKopo payment ID");
  }

  const accessToken = await getAccessToken();
  const res = await fetch(`${KOPOKOPO_API_BASE_URL}/api/v2/incoming_payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "Sorana Rentals/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch KopoKopo payment status (HTTP ${res.status})${text ? `: ${text}` : ""}`);
  }

  const raw = (await res.json()) as {
    data?: {
      attributes?: {
        status?: string;
        event?: {
          resource?: {
            reference?: string;
            status?: string;
            till_number?: string;
          } | null;
        };
      };
    };
  };

  const attrStatus = raw?.data?.attributes?.status;
  const resourceStatus = raw?.data?.attributes?.event?.resource?.status;
  const status = normalizeStatus(attrStatus || resourceStatus);
  const reference = raw?.data?.attributes?.event?.resource?.reference || undefined;
  const receipt = raw?.data?.attributes?.event?.resource?.reference || raw?.data?.attributes?.event?.resource?.till_number || undefined;

  return { status, raw, reference, receipt };
}

export function verifyKopokopoWebhookSignature(body: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  requireEnv("KOPOKOPO_API_KEY", KOPOKOPO_API_KEY);
  const expected = crypto.createHmac("sha256", KOPOKOPO_API_KEY).update(body, "utf8").digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const signatureBytes = Buffer.from(signatureHeader.trim(), "utf8");
  if (expectedBytes.length !== signatureBytes.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBytes, signatureBytes);
}

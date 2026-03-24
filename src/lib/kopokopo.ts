// src/lib/kopokopo.ts
import "server-only";

const KOPOKOPO_BASE_URL = (process.env.KOPOKOPO_BASE_URL || "").replace(/\/$/, "");
const KOPOKOPO_OAUTH_BASE_URL = (process.env.KOPOKOPO_OAUTH_BASE_URL || KOPOKOPO_BASE_URL || "https://sandbox.kopokopo.com").replace(
  /\/$/,
  ""
);
const KOPOKOPO_API_BASE_URL = (process.env.KOPOKOPO_API_BASE_URL || KOPOKOPO_BASE_URL || "https://sandbox.kopokopo.com").replace(
  /\/$/,
  ""
);
const KOPOKOPO_CLIENT_ID = process.env.KOPOKOPO_CLIENT_ID || "";
const KOPOKOPO_CLIENT_SECRET = process.env.KOPOKOPO_CLIENT_SECRET || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`Missing required env: ${name}`);
}

export type KopoKopoPayRecipientType = "till" | "paybill" | "bank_account";

export async function getKopoKopoAccessToken(): Promise<string> {
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

  const res = await fetch(`${KOPOKOPO_OAUTH_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KopoKopo token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("KopoKopo token response missing access_token");

  const expiresInSec = data.expires_in ?? 3600;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInSec * 1000,
  };

  return data.access_token;
}

export async function createPayRecipient(params: {
  type: KopoKopoPayRecipientType;
  payload: Record<string, string>;
}): Promise<{ location: string }> {
  const token = await getKopoKopoAccessToken();

  const res = await fetch(`${KOPOKOPO_API_BASE_URL}/api/v1/pay_recipients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      type: params.type,
      pay_recipient: params.payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KopoKopo pay recipient failed (${res.status}): ${text}`);
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("KopoKopo response missing Location header");
  }

  return { location };
}

export async function createIncomingPaymentRequest(params: {
  tillNumber: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, string>;
  callbackUrl: string;
}): Promise<{ location: string; id: string }> {
  const token = await getKopoKopoAccessToken();

  const res = await fetch(`${KOPOKOPO_API_BASE_URL}/api/v1/incoming_payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      payment_channel: "M-PESA STK Push",
      till_number: params.tillNumber,
      subscriber: {
        first_name: params.firstName,
        last_name: params.lastName,
        phone_number: params.phoneNumber,
        email: params.email,
      },
      amount: {
        currency: params.currency || "KES",
        value: params.amount,
      },
      metadata: params.metadata,
      _links: {
        callback_url: params.callbackUrl,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KopoKopo incoming payment request failed (${res.status}): ${text}`);
  }

  const location = res.headers.get("Location") || "";
  if (!location) {
    throw new Error("KopoKopo response missing Location header");
  }
  const id = location.split("/").pop() || "";
  if (!id) {
    throw new Error("KopoKopo response missing incoming payment id");
  }

  return { location, id };
}

export async function getIncomingPaymentStatus(id: string): Promise<{
  status: string;
  reference?: string;
  amount?: number;
  phoneNumber?: string;
  originationTime?: string;
}> {
  const token = await getKopoKopoAccessToken();
  const res = await fetch(`${KOPOKOPO_API_BASE_URL}/api/v1/incoming_payments/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KopoKopo incoming payment status failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as any;
  const attributes = data?.data?.attributes || {};
  const eventResource = attributes?.event?.resource || {};
  return {
    status: String(attributes?.status || ""),
    reference: eventResource?.reference || undefined,
    amount: eventResource?.amount ? Number(eventResource.amount) : undefined,
    phoneNumber: eventResource?.sender_phone_number || undefined,
    originationTime: eventResource?.origination_time || undefined,
  };
}

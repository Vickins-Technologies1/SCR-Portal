// src/lib/tuma.ts
import "server-only";

const TUMA_API_BASE_URL = (process.env.TUMA_API_BASE_URL || "https://api.tuma.co.ke").replace(/\/$/, "");
const TUMA_EMAIL = (process.env.TUMA_EMAIL || "").trim();
const TUMA_API_KEY = (process.env.TUMA_API_KEY || "").trim();

let cachedToken: { token: string; expiresAt: number } | null = null;

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`Missing required env: ${name}`);
}

export function isTumaConfigured(): boolean {
  return !!(TUMA_EMAIL && TUMA_API_KEY);
}

export async function getTumaToken(): Promise<string> {
  requireEnv("TUMA_EMAIL", TUMA_EMAIL);
  requireEnv("TUMA_API_KEY", TUMA_API_KEY);

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${TUMA_API_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TUMA_EMAIL,
      api_key: TUMA_API_KEY,
    }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.success === false) {
    const message = data?.message || `Tuma auth failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  const token = data?.data?.token || data?.token;
  if (!token) throw new Error("Tuma auth response missing token");

  const expiresIn = Number(data?.data?.expires_in || data?.expires_in);
  const ttlMs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 55 * 60 * 1000;
  cachedToken = { token, expiresAt: now + ttlMs };

  return token;
}

export async function createTumaStkPush(params: {
  amount: number;
  phone: string;
  description: string;
  callbackUrl?: string;
}): Promise<{
  merchantRequestId?: string;
  checkoutRequestId?: string;
  customerMessage?: string;
  raw: any;
}> {
  const token = await getTumaToken();
  const payload: Record<string, any> = {
    amount: params.amount,
    phone: params.phone,
    description: params.description,
  };
  if (params.callbackUrl) {
    payload.callback_url = params.callbackUrl;
  }

  const res = await fetch(`${TUMA_API_BASE_URL}/payment/stk-push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.success === false) {
    const message = data?.message || `Tuma STK Push failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  const responseData = data?.data || data || {};
  return {
    merchantRequestId: responseData.merchant_request_id || responseData.merchantRequestId || "",
    checkoutRequestId: responseData.checkout_request_id || responseData.checkoutRequestId || "",
    customerMessage: responseData.customer_message || responseData.customerMessage || data?.message || "",
    raw: data,
  };
}

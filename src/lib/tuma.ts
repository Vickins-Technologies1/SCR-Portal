// src/lib/tuma.ts
import "server-only";

const DEFAULT_TUMA_API_BASE_URL = (process.env.TUMA_API_BASE_URL || "https://api.tuma.co.ke").replace(/\/$/, "");

export type TumaCredentials = {
  email: string;
  apiKey: string;
  baseUrl?: string;
};

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`Missing required env: ${name}`);
}

function cacheKey(credentials: TumaCredentials): string {
  const baseUrl = (credentials.baseUrl || DEFAULT_TUMA_API_BASE_URL).replace(/\/$/, "");
  return `${baseUrl}|${credentials.email}|${credentials.apiKey}`;
}

export function isTumaConfigured(credentials?: TumaCredentials | null): boolean {
  return !!(credentials?.email && credentials?.apiKey);
}

export async function getTumaToken(credentials: TumaCredentials): Promise<string> {
  const email = credentials.email.trim();
  const apiKey = credentials.apiKey.trim();
  const baseUrl = (credentials.baseUrl || DEFAULT_TUMA_API_BASE_URL).replace(/\/$/, "");

  requireEnv("TUMA_EMAIL", email);
  requireEnv("TUMA_API_KEY", apiKey);

  const now = Date.now();
  const key = cacheKey({ email, apiKey, baseUrl });
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const res = await fetch(`${baseUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      api_key: apiKey,
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
  tokenCache.set(key, { token, expiresAt: now + ttlMs });

  return token;
}

export async function createTumaStkPush(params: {
  amount: number;
  phone: string;
  description: string;
  callbackUrl?: string;
  credentials: TumaCredentials;
}): Promise<{
  merchantRequestId?: string;
  checkoutRequestId?: string;
  customerMessage?: string;
  raw: any;
}> {
  const token = await getTumaToken(params.credentials);
  const baseUrl = (params.credentials.baseUrl || DEFAULT_TUMA_API_BASE_URL).replace(/\/$/, "");
  const payload: Record<string, any> = {
    amount: params.amount,
    phone: params.phone,
    description: params.description,
  };
  if (params.callbackUrl) {
    payload.callback_url = params.callbackUrl;
  }

  const res = await fetch(`${baseUrl}/payment/stk-push`, {
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

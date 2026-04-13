// src/lib/tuma.ts
import "server-only";

const DEFAULT_TUMA_API_BASE_URL = (process.env.TUMA_API_BASE_URL || "https://api.tuma.co.ke").replace(/\/$/, "");

export type TumaCredentials = {
  email: string;
  apiKey: string;
  baseUrl?: string;
};

export type TumaBank = {
  id: string;
  name: string;
  code?: string;
  country?: string;
};

export type TumaBusinessPayload = {
  name: string;
  email: string;
  mobile: string;
  bankId: string;
  accountNumber: string;
  logo: string;
  description?: string;
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

export async function fetchTumaBanks(baseUrl?: string): Promise<TumaBank[]> {
  const resolvedBaseUrl = (baseUrl || DEFAULT_TUMA_API_BASE_URL).replace(/\/$/, "");
  const res = await fetch(`${resolvedBaseUrl}/reference/banks`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.success === false) {
    const message = data?.message || `Failed to fetch Tuma banks (HTTP ${res.status})`;
    throw new Error(message);
  }

  const banks = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return banks.map((bank: any) => ({
    id: String(bank?.id || ""),
    name: String(bank?.name || ""),
    code: bank?.code ? String(bank.code) : undefined,
    country: bank?.country ? String(bank.country) : undefined,
  }));
}

export async function createTumaBusiness(params: {
  credentials: TumaCredentials;
  business: TumaBusinessPayload;
}): Promise<{
  id: string;
  apiKey: string;
  email: string;
  name: string;
  raw: any;
}> {
  const token = await getTumaToken(params.credentials);
  const baseUrl = (params.credentials.baseUrl || DEFAULT_TUMA_API_BASE_URL).replace(/\/$/, "");
  const payload: Record<string, any> = {
    name: params.business.name,
    email: params.business.email,
    mobile: params.business.mobile,
    bank_id: params.business.bankId,
    account_number: params.business.accountNumber,
    logo: params.business.logo,
  };
  if (params.business.description) {
    payload.description = params.business.description;
  }

  const res = await fetch(`${baseUrl}/businesses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.success === false) {
    const message = data?.message || `Failed to create Tuma business (HTTP ${res.status})`;
    throw new Error(message);
  }

  const responseData = data?.data || data || {};
  return {
    id: String(responseData?.id || ""),
    apiKey: String(responseData?.api_key || ""),
    email: String(responseData?.email || params.business.email || ""),
    name: String(responseData?.name || params.business.name || ""),
    raw: data,
  };
}

import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

export type TurnstileAction =
  | "login"
  | "signup"
  | "password_reset_request"
  | "password_reset"
  | "otp_verify"
  | "otp_resend"
  | "google_auth";

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "invalid" | "unavailable" };

const ACTION_LIMITS: Record<TurnstileAction, number> = {
  login: 20,
  signup: 5,
  password_reset_request: 5,
  password_reset: 10,
  otp_verify: 10,
  otp_resend: 5,
  google_auth: 8,
};
const localRateLimits = new Map<string, { count: number; resetAt: number }>();

function resolveTrustedClientIp(request: Request): string {
  if (request.headers.get("cf-ray")) {
    const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
    if (cloudflareIp) return cloudflareIp;
  }
  // Vercel overwrites these platform headers at its edge; do not use a bare
  // client-supplied X-Forwarded-For value when no trusted proxy marker exists.
  if (request.headers.get("x-vercel-id")) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "unknown";
}

function getLimiter(action: TurnstileAction) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(ACTION_LIMITS[action], "15 m"),
    prefix: `auth:${action}`,
  });
}

async function checkAuthRateLimit(request: Request, action: TurnstileAction): Promise<"ok" | "limited" | "unavailable"> {
  let body: Record<string, unknown> = {};
  try { body = await request.clone().json() as Record<string, unknown>; } catch { /* token parser handles malformed bodies */ }
  const identity = [body.email, body.phone, body.otpId]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const fingerprint = identity
    ? createHash("sha256").update(identity.trim().toLowerCase()).digest("hex")
    : "anonymous";
  const ip = resolveTrustedClientIp(request);
  const keys = [`ip:${ip}`, `identity:${fingerprint}`];

  const limiter = getLimiter(action);
  if (limiter) {
    try {
      const results = await Promise.all(keys.map((key) => limiter.limit(key)));
      return results.every((result) => result.success) ? "ok" : "limited";
    } catch {
      return "unavailable";
    }
  }

  if (process.env.NODE_ENV === "production") return "unavailable";
  const now = Date.now();
  for (const key of keys) {
    const fullKey = `${action}:${key}`;
    let record = localRateLimits.get(fullKey);
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + 15 * 60_000 };
      localRateLimits.set(fullKey, record);
    }
    record.count += 1;
    if (record.count > ACTION_LIMITS[action]) return "limited";
  }
  return "ok";
}

/** Verify the browser token at Cloudflare before performing a public auth action. */
export async function verifyTurnstile(
  request: Request | NextRequest,
  expectedAction: TurnstileAction,
): Promise<TurnstileResult> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim();
  const tokenFromHeader = request.headers.get("x-turnstile-token")?.trim();
  let token = tokenFromHeader;

  if (!token) {
    try {
      const body = await request.clone().json() as { turnstileToken?: unknown };
      token = typeof body?.turnstileToken === "string" ? body.turnstileToken.trim() : "";
    } catch {
      token = "";
    }
  }

  if (!token) return { ok: false, reason: "missing" };
  if (token.length > 2048) return { ok: false, reason: "invalid" };
  if (!secret) return { ok: false, reason: "unavailable" };

  const configuredHostnames = (process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  const requestHostname = new URL(request.url).hostname.toLowerCase();
  const allowedHostnames = configuredHostnames.length
    ? configuredHostnames
    : process.env.NODE_ENV === "production"
      ? []
      : [requestHostname];

  // Production must use an explicit allowlist so a forged Host header cannot
  // decide which hostname is accepted from Siteverify.
  if (!allowedHostnames.length) return { ok: false, reason: "unavailable" };

  const form = new URLSearchParams({ secret, response: token });
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("Turnstile Siteverify event", { action: expectedAction, outcome: "http_failure", status: response.status });
      return { ok: false, reason: "unavailable" };
    }

    const result = await response.json() as SiteverifyResponse;
    if (
      result.success !== true ||
      result.action !== expectedAction ||
      typeof result.hostname !== "string" ||
      !allowedHostnames.includes(result.hostname.toLowerCase())
    ) {
      const codes = Array.isArray(result["error-codes"])
        ? result["error-codes"].filter((code): code is string => typeof code === "string").slice(0, 5)
        : [];
      console.warn("Turnstile Siteverify event", {
        action: expectedAction,
        outcome: result.success === true ? "hostname_or_action_mismatch" : "rejected",
        codes,
      });
      return { ok: false, reason: "invalid" };
    }
    return { ok: true };
  } catch {
    console.warn("Turnstile Siteverify event", { action: expectedAction, outcome: "network_or_response_error" });
    return { ok: false, reason: "unavailable" };
  }
}

export function turnstileFailureResponse(reason: "missing" | "invalid" | "unavailable") {
  // Keep provider details out of user-facing responses and logs.
  const message = reason === "unavailable"
    ? "Verification is temporarily unavailable. Please try again."
    : "Please complete the security check and try again.";
  return Response.json({ success: false, code: "TURNSTILE_REQUIRED", message }, { status: reason === "unavailable" ? 503 : 403 });
}

export async function requireTurnstile(request: Request | NextRequest, action: TurnstileAction): Promise<Response | null> {
  const rateLimit = await checkAuthRateLimit(request, action);
  if (rateLimit === "limited") {
    return Response.json({ success: false, code: "AUTH_RATE_LIMITED", message: "Too many attempts. Please wait and try again." }, { status: 429 });
  }
  if (rateLimit === "unavailable") {
    console.warn("Authentication protection event", { action, outcome: "rate_limit_unavailable" });
    return Response.json({ success: false, code: "AUTH_PROTECTION_UNAVAILABLE", message: "Security protection is temporarily unavailable. Please try again." }, { status: 503 });
  }
  const result = await verifyTurnstile(request, action);
  if (!result.ok) {
    console.warn("Authentication protection event", { action, outcome: result.reason });
  }
  return result.ok ? null : turnstileFailureResponse(result.reason);
}

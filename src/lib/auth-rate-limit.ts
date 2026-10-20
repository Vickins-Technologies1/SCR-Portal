import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type AuthRateLimitAction =
  | "login"
  | "signup"
  | "password_reset_request"
  | "password_reset"
  | "otp_verify"
  | "otp_resend"
  | "google_auth";

const ACTION_LIMITS: Record<AuthRateLimitAction, number> = {
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

function getLimiter(action: AuthRateLimitAction) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(ACTION_LIMITS[action], "15 m"),
    prefix: `auth:${action}`,
  });
}

async function checkAuthRateLimit(request: Request, action: AuthRateLimitAction): Promise<"ok" | "limited" | "unavailable"> {
  let body: Record<string, unknown> = {};
  try { body = await request.clone().json() as Record<string, unknown>; } catch { /* malformed JSON is handled by the route */ }
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

export async function requireAuthRateLimit(request: Request, action: AuthRateLimitAction): Promise<Response | null> {
  const result = await checkAuthRateLimit(request, action);
  if (result === "limited") {
    return Response.json({ success: false, code: "AUTH_RATE_LIMITED", message: "Too many attempts. Please wait and try again." }, { status: 429 });
  }
  if (result === "unavailable") {
    console.warn("Authentication rate limit event", { action, outcome: "unavailable" });
    return Response.json({ success: false, code: "AUTH_PROTECTION_UNAVAILABLE", message: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
  }
  return null;
}

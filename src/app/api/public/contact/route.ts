import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { sendContactLeadEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;
const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4000;

const CONTACT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CONTACT_RATE_LIMIT_MAX = 5;

const splitCsv = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const getRequestIp = (req: NextRequest) => {
  const forwardedFor =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-vercel-forwarded-for");
  if (!forwardedFor) return "unknown";
  return forwardedFor.split(",")[0]?.trim() || "unknown";
};

const corsHeaders = (origin: string | null) => {
  const allowedOrigins = splitCsv(process.env.CONTACT_API_ALLOWED_ORIGINS);

  let allowOrigin = "*";
  if (origin && allowedOrigins.length > 0) {
    allowOrigin = allowedOrigins.includes(origin) ? origin : "null";
  } else if (origin && allowedOrigins.length === 0) {
    // Default to reflecting origin when not configured, to make local/preview setups easy.
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    email: z.string().trim().email().max(MAX_EMAIL_LENGTH).optional().or(z.literal("")),
    phone: z.string().trim().max(MAX_PHONE_LENGTH).optional().or(z.literal("")),
    subject: z.string().trim().max(MAX_SUBJECT_LENGTH).optional().or(z.literal("")),
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    website: z.string().trim().max(200).optional().or(z.literal("")), // honeypot
    hcaptchaToken: z.string().trim().min(1).optional(),
  })
  .strict();

async function verifyHcaptcha(token: string, remoteIp: string) {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) return { ok: true as const };

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (remoteIp && remoteIp !== "unknown") params.set("remoteip", remoteIp);

  const res = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) return { ok: false as const, message: "Captcha verification failed" };
  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  if (!data?.success) {
    return { ok: false as const, message: "Captcha invalid", codes: data?.["error-codes"] };
  }
  return { ok: true as const };
}

async function enforceRateLimit(ip: string) {
  const cutoffIso = new Date(Date.now() - CONTACT_RATE_LIMIT_WINDOW_MS).toISOString();
  const { db } = await connectToDatabase();

  const count = await db.collection("contactLeads").countDocuments({
    ip,
    createdAt: { $gte: cutoffIso },
  });

  if (count >= CONTACT_RATE_LIMIT_MAX) {
    return { ok: false as const, retryAfterSeconds: Math.ceil(CONTACT_RATE_LIMIT_WINDOW_MS / 1000) };
  }

  return { ok: true as const };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400, headers });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid payload", issues: parsed.error.issues },
      { status: 400, headers }
    );
  }

  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;
  const referer = req.headers.get("referer") || undefined;

  const payload = parsed.data;

  // Honeypot: if filled, pretend it's ok (prevents bots from learning).
  if (payload.website) {
    return NextResponse.json({ success: true }, { status: 200, headers });
  }

  try {
    const rate = await enforceRateLimit(ip);
    if (!rate.ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429, headers: { ...headers, "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    if (process.env.HCAPTCHA_SECRET) {
      if (!payload.hcaptchaToken) {
        return NextResponse.json(
          { success: false, message: "Captcha token required" },
          { status: 400, headers }
        );
      }
      const captcha = await verifyHcaptcha(payload.hcaptchaToken, ip);
      if (!captcha.ok) {
        return NextResponse.json(
          { success: false, message: captcha.message || "Captcha invalid" },
          { status: 400, headers }
        );
      }
    }

    const createdAt = new Date().toISOString();

    const { db } = await connectToDatabase();
    const insertRes = await db.collection("contactLeads").insertOne({
      name: payload.name,
      email: payload.email || undefined,
      phone: payload.phone || undefined,
      subject: payload.subject || undefined,
      message: payload.message,
      createdAt,
      ip,
      origin: origin || undefined,
      referer,
      userAgent,
    });

    const to = process.env.CONTACT_FORM_TO_EMAIL || process.env.SMTP_USER;
    if (to) {
      await sendContactLeadEmail({
        to,
        name: payload.name,
        email: payload.email || undefined,
        phone: payload.phone || undefined,
        subject: payload.subject || undefined,
        message: payload.message,
        meta: {
          id: insertRes.insertedId.toString(),
          createdAt,
          ip,
          origin: origin || undefined,
          referer,
          userAgent,
        },
      });
    } else {
      logger.warn("CONTACT_FORM_TO_EMAIL / SMTP_USER not configured; contact lead stored only", {
        id: insertRes.insertedId.toString(),
      });
    }

    return NextResponse.json({ success: true, id: insertRes.insertedId.toString() }, { status: 200, headers });
  } catch (error) {
    logger.error("POST /api/public/contact failed", {
      message: error instanceof Error ? error.message : String(error),
      ip,
      origin,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500, headers });
  }
}

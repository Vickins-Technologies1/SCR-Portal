// src/app/api/tenant/reset-password-request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import crypto from "crypto";
import validator from "validator";
import logger from "../../../../lib/logger";
import { sendPasswordResetEmail } from "../../../../lib/email";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Simple in-memory rate limiter (IP-based)
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10;

function rateLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const key = ip || "unknown";
  let record = rateLimitStore.get(key);

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, lastReset: now };
    rateLimitStore.set(key, record);
    return { ok: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  record.count += 1;
  rateLimitStore.set(key, record);

  if (record.count > RATE_LIMIT_MAX) {
    return { ok: false, remaining: 0 };
  }

  return { ok: true, remaining: RATE_LIMIT_MAX - record.count };
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const { ok, remaining } = rateLimit(ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later.", remaining },
        { status: 429 }
      );
    }

    const csrfHeader = request.headers.get("x-csrf-token");
    if (!csrfHeader || !validateCsrfToken(request, csrfHeader)) {
      logger.warn("Invalid CSRF token in tenant reset request", { ip });
      return buildInvalidCsrfResponse(request);
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email || !validator.isEmail(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const tenant = await db.collection("tenants").findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    });

    // Always return success to avoid account enumeration
    if (!tenant) {
      return NextResponse.json({
        success: true,
        message: "If this email is registered, a reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.collection("passwordResets").insertOne({
      tenantId: tenant._id,
      role: "tenant",
      email: tenant.email,
      token: resetToken,
      expiresAt,
      used: false,
      createdAt: new Date(),
    });

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin || "http://localhost:3000").trim();
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(
      tenant.email
    )}&role=tenant`;

    try {
      await sendPasswordResetEmail({
        to: tenant.email,
        name: tenant.name || "Tenant",
        resetLink,
        propertyName: tenant.propertyName || "your property",
        houseNumber: tenant.houseNumber || "",
      });
    } catch (emailErr: any) {
      logger.error("Failed to send tenant password reset email", {
        tenantId: tenant._id?.toString?.() ?? String(tenant._id),
        error: emailErr?.message || "Unknown error",
      });
      return NextResponse.json(
        { success: false, message: "Failed to send reset email. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "If this email is registered, a reset link has been sent.",
    });
  } catch (error: any) {
    logger.error("Tenant reset request error", {
      ip,
      error: error?.message || "Unknown error",
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}


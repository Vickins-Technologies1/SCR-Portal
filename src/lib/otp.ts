// src/lib/otp.ts
import crypto from "crypto";

export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUIRE_AFTER_MS = 16 * 60 * 60 * 1000; // 16 hours
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const OTP_MAX_RESENDS = 5;

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function shouldBypassOtp(email?: string | null, role?: string | null): boolean {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const demoEmails = new Set(["demo@admin.com", "tenant@demo.com"]);

  if (normalizedEmail && demoEmails.has(normalizedEmail)) {
    return true;
  }

  if (process.env.DEMO_OTP_BYPASS !== "true") return false;
  if (process.env.NODE_ENV === "production" && process.env.DEMO_OTP_BYPASS_ALLOW_PROD !== "true") {
    return false;
  }

  const allowedRoles = (process.env.DEMO_OTP_BYPASS_ROLES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedRoles.length > 0 && (!role || !allowedRoles.includes(role))) {
    return false;
  }

  const allowedEmails = (process.env.DEMO_OTP_BYPASS_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedEmails.length || !normalizedEmail) return false;
  return allowedEmails.includes(normalizedEmail);
}

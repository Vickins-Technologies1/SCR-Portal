// src/lib/csrf.ts
import { v4 as uuidv4 } from "uuid";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_MAX_AGE_SECONDS } from "./session";

export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

export function getCsrfCookieOptions() {
  return {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: CSRF_MAX_AGE_SECONDS,
    path: "/",
  };
}

export function setCsrfCookie(response: NextResponse, token: string) {
  response.cookies.set(CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
}

export function generateCsrfToken(): string {
  return uuidv4();
}

export function validateCsrfToken(req: NextRequest, token: string | null): boolean {
  const storedToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const submittedToken = token || req.headers.get("x-csrf-token");
  return !!submittedToken && storedToken === submittedToken;
}

export function buildInvalidCsrfResponse(
  _req: NextRequest,
  message: string = "Invalid CSRF token"
) {
  return NextResponse.json({ success: false, message }, { status: 403 });
}

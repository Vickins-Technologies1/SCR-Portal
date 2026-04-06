// src/lib/csrf.ts
import { v4 as uuidv4 } from "uuid";
import { NextRequest, NextResponse } from "next/server";

export function generateCsrfToken(): string {
  return uuidv4();
}

export function validateCsrfToken(req: NextRequest, token: string | null): boolean {
  const storedToken = req.cookies.get("csrf-token")?.value;
  const submittedToken = token || req.headers.get("x-csrf-token");
  return !!submittedToken && storedToken === submittedToken;
}

const AUTH_COOKIES = [
  "session",
  "userId",
  "role",
  "permissions",
  "ownerId",
  "csrf-token",
  "impersonatingTenantId",
  "isImpersonating",
  "adminOriginalUserId",
  "adminOriginalRole",
  "adminImpersonating",
  "adminImpersonatingOwnerId",
  "adminImpersonatingOwnerName",
];

export function getLoginRedirectPath(req: NextRequest): string {
  const role = req.cookies.get("adminOriginalRole")?.value || req.cookies.get("role")?.value;
  if (role === "admin") return "/admin/login";
  if (role === "tenant") return "/tenant-login";
  return "/";
}

export function clearAuthCookies(response: NextResponse) {
  AUTH_COOKIES.forEach((name) => {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  });
}

export function buildInvalidCsrfResponse(
  req: NextRequest,
  message: string = "Invalid CSRF token"
) {
  const redirect = getLoginRedirectPath(req);
  const response = NextResponse.json(
    { success: false, message, logout: true, redirect },
    { status: 403 }
  );
  clearAuthCookies(response);
  return response;
}

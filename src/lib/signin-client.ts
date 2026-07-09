"use client";

import Cookies from "js-cookie";

type SignInResult = {
  success: boolean;
  userId?: string;
  role?: string;
  redirect?: string;
  permissions?: string[];
  adminName?: string;
  requiresOtp?: boolean;
  otpId?: string;
  message?: string;
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function persistClientCookies(params: { userId: string; role: string; permissions?: unknown; adminName?: unknown }) {
  const isSecure =
    typeof window !== "undefined" ? window.location.protocol === "https:" : process.env.NODE_ENV === "production";

  const base = {
    path: "/",
    secure: isSecure,
    sameSite: "Lax" as const,
    expires: 7,
  };

  Cookies.set("userId", params.userId, base);
  Cookies.set("role", params.role, base);
  if (params.permissions) {
    try {
      Cookies.set("permissions", JSON.stringify(params.permissions), base);
    } catch {
      // ignore
    }
  }
  if (params.adminName) {
    try {
      Cookies.set("adminName", String(params.adminName || "Admin"), base);
    } catch {
      // ignore
    }
  }
}

export async function signInOwner(params: { email: string; password: string; appHash?: string }): Promise<SignInResult> {
  const { ok, data } = await postJson("/api/signin", { email: params.email, password: params.password, appHash: params.appHash });
  const result = data as SignInResult;
  if (result?.success && result.userId && result.role) {
    persistClientCookies({ userId: result.userId, role: result.role, permissions: result.permissions, adminName: result.adminName });
  }
  // For OTP-required flows, backend returns 200 with requiresOtp; treat as ok.
  if (!ok && !result?.requiresOtp) throw new Error(result?.message || "Login failed");
  return result;
}

export async function signInTenant(params: { email: string; password: string; portal?: "rental" | "airbnb"; appHash?: string }): Promise<SignInResult> {
  const { ok, data } = await postJson("/api/signin", {
    email: params.email,
    password: params.password,
    appHash: params.appHash,
    role: "tenant",
    portal: params.portal || "rental",
  });
  const result = data as SignInResult;
  if (result?.success && result.userId && result.role) {
    persistClientCookies({ userId: result.userId, role: result.role, permissions: result.permissions, adminName: result.adminName });
  }
  if (!ok && !result?.requiresOtp) throw new Error(result?.message || "Login failed");
  return result;
}

export async function signInAdmin(params: { email: string; password: string; appHash?: string }): Promise<SignInResult> {
  const { ok, data } = await postJson("/api/admin/login", { email: params.email, password: params.password, appHash: params.appHash, role: "admin" });
  const result = data as SignInResult;
  if (result?.success && result.userId && result.role) {
    persistClientCookies({ userId: result.userId, role: result.role, permissions: result.permissions, adminName: result.adminName });
  }
  if (!ok && !result?.requiresOtp) throw new Error(result?.message || "Login failed");
  return result;
}

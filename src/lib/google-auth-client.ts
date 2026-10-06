"use client";

import { getAndroidAppHash } from "@/lib/android-sms-retriever";
import { isNativeCapacitor } from "@/lib/quick-login";
import type { GoogleAuthAction, GoogleAuthPortal, GoogleAuthPlatform } from "@/lib/google-auth";

export type GoogleAuthStartParams = {
  portal: GoogleAuthPortal;
  action: GoogleAuthAction;
  returnTo?: string;
  managementType?: "rentals" | "airbnb";
  packageTier?: "free" | "one_percent" | "full_management" | "lifetime";
  tier?: "free" | "premium";
  tenantPortal?: "rental" | "airbnb";
  platform?: GoogleAuthPlatform;
  appHash?: string;
};

export async function buildGoogleAuthStartUrl(params: GoogleAuthStartParams): Promise<string> {
  const url = new URL("/api/auth/google", window.location.origin);
  const nativePlatform = params.platform || ((await isNativeCapacitor()) ? "app" : "web");
  const appHash = params.appHash?.trim() || (nativePlatform === "app" ? (await getAndroidAppHash()).trim() : "");

  url.searchParams.set("portal", params.portal);
  url.searchParams.set("action", params.action);
  if (params.returnTo) url.searchParams.set("returnTo", params.returnTo);
  if (params.managementType) url.searchParams.set("managementType", params.managementType);
  if (params.packageTier) url.searchParams.set("packageTier", params.packageTier);
  if (params.tier) url.searchParams.set("tier", params.tier);
  if (params.tenantPortal) url.searchParams.set("tenantPortal", params.tenantPortal);
  if (appHash) url.searchParams.set("appHash", appHash);

  url.searchParams.set("platform", nativePlatform);

  return url.toString();
}

export async function signInWithGoogleNative(params: GoogleAuthStartParams): Promise<boolean> {
  if (!(await isNativeCapacitor())) return false;
  const configResponse = await fetch("/api/auth/google/config", { cache: "no-store" });
  const config = await configResponse.json().catch(() => null);
  if (!configResponse.ok || !config?.clientId) throw new Error("Google login is not configured.");

  const { GoogleAuth } = await import("@/lib/google-auth-native");
  const result = await GoogleAuth.signIn({ serverClientId: config.clientId });
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...params, idToken: result.idToken, platform: "app" }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.callbackUrl) throw new Error(data?.message || "Unable to complete Google sign-in.");
  window.location.assign(data.callbackUrl);
  return true;
}

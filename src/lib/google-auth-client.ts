"use client";

import { isNativeCapacitor } from "@/lib/quick-login";
import type { GoogleAuthAction, GoogleAuthPortal, GoogleAuthPlatform } from "@/lib/google-auth";

export type GoogleAuthStartParams = {
  portal: GoogleAuthPortal;
  action: GoogleAuthAction;
  returnTo?: string;
  managementType?: "rentals" | "airbnb";
  packageTier?: "free" | "one_percent" | "full_management";
  tier?: "free" | "premium";
  tenantPortal?: "rental" | "airbnb";
  platform?: GoogleAuthPlatform;
  appHash?: string;
};

export async function buildGoogleAuthStartUrl(params: GoogleAuthStartParams): Promise<string> {
  const url = new URL("/api/auth/google", window.location.origin);

  url.searchParams.set("portal", params.portal);
  url.searchParams.set("action", params.action);
  if (params.returnTo) url.searchParams.set("returnTo", params.returnTo);
  if (params.managementType) url.searchParams.set("managementType", params.managementType);
  if (params.packageTier) url.searchParams.set("packageTier", params.packageTier);
  if (params.tier) url.searchParams.set("tier", params.tier);
  if (params.tenantPortal) url.searchParams.set("tenantPortal", params.tenantPortal);
  if (params.appHash) url.searchParams.set("appHash", params.appHash);

  const nativePlatform = params.platform || ((await isNativeCapacitor()) ? "app" : "web");
  url.searchParams.set("platform", nativePlatform);

  return url.toString();
}

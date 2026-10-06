import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthorizeUrl,
  createGoogleStateToken,
  createGoogleNativeHandoffToken,
  getGoogleRedirectUri,
  verifyGoogleIdToken,
  type GoogleAuthAction,
  type GoogleAuthPortal,
  type GoogleAuthPlatform,
} from "@/lib/google-auth";

function parsePortal(value: string | null): GoogleAuthPortal {
  return value === "tenant" || value === "admin" ? value : "owner";
}

function parseAction(value: string | null): GoogleAuthAction {
  return value === "login" ? "login" : "signup";
}

function parsePlatform(value: string | null): GoogleAuthPlatform {
  return value === "app" ? "app" : "web";
}

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      return NextResponse.json(
        {
          success: false,
          message: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const portal = parsePortal(url.searchParams.get("portal"));
    const action = parseAction(url.searchParams.get("action"));
    const platform = parsePlatform(url.searchParams.get("platform"));

    const state = await createGoogleStateToken({
      portal,
      action,
      platform,
      appHash: url.searchParams.get("appHash") || undefined,
      returnTo: url.searchParams.get("returnTo") || undefined,
      managementType:
        url.searchParams.get("managementType") === "airbnb"
          ? "airbnb"
          : url.searchParams.get("managementType") === "rentals"
            ? "rentals"
            : undefined,
      packageTier:
        url.searchParams.get("packageTier") === "one_percent" ||
        url.searchParams.get("packageTier") === "full_management" ||
        url.searchParams.get("packageTier") === "free" ||
        url.searchParams.get("packageTier") === "lifetime"
          ? (url.searchParams.get("packageTier") as "free" | "one_percent" | "full_management" | "lifetime")
          : undefined,
      tier: url.searchParams.get("tier") === "free" || url.searchParams.get("tier") === "premium"
        ? (url.searchParams.get("tier") as "free" | "premium")
        : undefined,
      tenantPortal: url.searchParams.get("tenantPortal") === "airbnb" ? "airbnb" : "rental",
      nonce: crypto.randomUUID(),
    });

    const redirectUri = getGoogleRedirectUri({ origin: request.nextUrl.origin, platform });

    const authorizeUrl = buildGoogleAuthorizeUrl({
      clientId,
      redirectUri,
      state,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error("Google auth start error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to start Google sign-in." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) return NextResponse.json({ success: false, message: "Google ID token is required." }, { status: 400 });

    const portal = parsePortal(typeof body.portal === "string" ? body.portal : null);
    const action = parseAction(typeof body.action === "string" ? body.action : null);
    const profile = await verifyGoogleIdToken(idToken);
    const nativeToken = await createGoogleNativeHandoffToken(profile);
    const state = await createGoogleStateToken({
      portal,
      action,
      platform: "app",
      appHash: typeof body.appHash === "string" ? body.appHash : undefined,
      returnTo: typeof body.returnTo === "string" ? body.returnTo : undefined,
      managementType: body.managementType === "airbnb" ? "airbnb" : body.managementType === "rentals" ? "rentals" : undefined,
      packageTier: ["free", "one_percent", "full_management", "lifetime"].includes(body.packageTier) ? body.packageTier : undefined,
      tier: body.tier === "free" || body.tier === "premium" ? body.tier : undefined,
      tenantPortal: body.tenantPortal === "airbnb" ? "airbnb" : "rental",
      nonce: crypto.randomUUID(),
    });
    const callback = new URL("/api/auth/google/callback", request.nextUrl.origin);
    callback.searchParams.set("code", nativeToken);
    callback.searchParams.set("state", state);
    return NextResponse.json({ success: true, callbackUrl: callback.toString() });
  } catch (error) {
    console.error("Native Google auth error:", error);
    return NextResponse.json({ success: false, message: "Unable to complete Google sign-in." }, { status: 401 });
  }
}

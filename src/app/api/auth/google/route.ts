import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthorizeUrl,
  createGoogleStateToken,
  getGoogleRedirectUri,
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
        url.searchParams.get("packageTier") === "free"
          ? (url.searchParams.get("packageTier") as "free" | "one_percent" | "full_management")
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

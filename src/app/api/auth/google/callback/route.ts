import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { createSessionToken, getSessionCookieOptions } from "@/lib/session";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { getDefaultPermissions } from "@/lib/permissions";
import { normalizeAdminPermissions } from "@/lib/admin-permissions";
import {
  createGooglePendingToken,
  exchangeGoogleCodeForProfile,
  type GoogleAuthAction,
  type GoogleAuthPortal,
  type GoogleAuthState,
  verifyGoogleStateToken,
} from "@/lib/google-auth";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  shouldBypassOtp,
} from "@/lib/otp";
import { deliverOtp } from "@/lib/otp-delivery";

type OwnerManagementType = "rentals" | "airbnb";
type AccountTier = "free" | "premium";

const OTP_COLLECTION = "otpChallenges";

function normalizeManagementType(value: unknown): OwnerManagementType {
  return value === "airbnb" ? "airbnb" : "rentals";
}

function normalizeTier(value: unknown): AccountTier {
  return value === "free" ? "free" : "premium";
}

function getDefaultOwnerPayload(state: GoogleAuthState) {
  return {
    managementType: state.managementType ?? "rentals",
    tier: state.tier ?? (state.packageTier === "free" ? "free" : "premium"),
    packageTier: state.packageTier ?? "one_percent",
  };
}

async function ensureOwnerAccount(db: Awaited<ReturnType<typeof connectToDatabase>>["db"], profile: { id: string; email: string; name: string; picture?: string }, state: GoogleAuthState) {
  const existing = await db.collection("propertyOwners").findOne({
    $or: [{ googleId: profile.id }, { email: new RegExp(`^${profile.email}$`, "i") }],
  });

  const defaults = getDefaultOwnerPayload(state);
  if (existing) {
    await db.collection("propertyOwners").updateOne(
      { _id: existing._id },
      {
        $set: {
          googleId: profile.id,
          googleEmail: profile.email,
          googlePicture: profile.picture || existing.googlePicture || null,
          googleName: profile.name,
          ...(existing.name ? {} : { name: profile.name }),
          ...(existing.email ? {} : { email: profile.email }),
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          managementType: defaults.managementType,
          tier: defaults.tier,
          packageTier: defaults.packageTier,
        },
      }
    );
    return db.collection("propertyOwners").findOne({ _id: existing._id });
  }

  const created = {
    name: profile.name,
    email: profile.email,
    password: "",
    phone: "",
    role: "propertyOwner",
    googleId: profile.id,
    googleEmail: profile.email,
    googlePicture: profile.picture || null,
    googleName: profile.name,
    managementType: defaults.managementType,
    tier: defaults.tier,
    packageTier: defaults.packageTier,
    isApproved: true,
    legalAcceptedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const insert = await db.collection("propertyOwners").insertOne(created);
  return db.collection("propertyOwners").findOne({ _id: insert.insertedId });
}

async function ensureTenantAccount(db: Awaited<ReturnType<typeof connectToDatabase>>["db"], profile: { id: string; email: string; name: string; picture?: string }, state: GoogleAuthState) {
  return db.collection("tenants").findOne({
    $or: [{ googleId: profile.id }, { email: new RegExp(`^${profile.email}$`, "i") }],
  });
}

async function ensureAdminAccount(db: Awaited<ReturnType<typeof connectToDatabase>>["db"], profile: { id: string; email: string; name: string; picture?: string }) {
  let user = await db.collection("propertyOwners").findOne({
    role: "admin",
    $or: [{ googleId: profile.id }, { email: new RegExp(`^${profile.email}$`, "i") }],
  });
  if (user) return { user, collection: "propertyOwners" as const, role: "admin" as const };

  user = await db.collection("adminTeamMembers").findOne({
    role: "adminTeamMember",
    active: true,
    $or: [{ googleId: profile.id }, { email: new RegExp(`^${profile.email}$`, "i") }],
  });
  if (user) return { user, collection: "adminTeamMembers" as const, role: "adminTeamMember" as const };

  return null;
}

async function createOtpChallenge(params: {
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"];
  user: any;
  role: string;
  collection: "tenants" | "propertyOwners" | "adminTeamMembers";
  redirectPath: string;
  isOwner?: boolean;
  isTeamMember?: boolean;
}) {
  const now = new Date();
  const otpEmail = params.user.email?.toString();
  const otpPhone = params.user.phone?.toString();

  if (!otpEmail || !otpPhone) {
    return { requiresPhone: true as const };
  }

  const otpCode = generateOtpCode();
  const otpRecordId = new ObjectId();

  await params.db.collection(OTP_COLLECTION).deleteMany({
    userId: params.user._id.toString(),
    purpose: "login",
  });

  await params.db.collection(OTP_COLLECTION).insertOne({
    _id: otpRecordId,
    userId: params.user._id.toString(),
    role: params.role,
    isTeamMember: Boolean(params.isTeamMember),
    isOwner: Boolean(params.isOwner),
    ownerId: params.isTeamMember ? params.user.ownerId?.toString() : null,
    email: otpEmail,
    phone: otpPhone,
    purpose: "login",
    codeHash: hashOtpCode(otpCode),
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
    lastSentAt: now,
    resendCount: 0,
    redirectPath: params.redirectPath,
    collection: params.collection,
  });

  const delivery = await deliverOtp({
    email: otpEmail,
    phone: otpPhone,
    name: params.user.name || "User",
    code: otpCode,
  });

  return {
    otpId: otpRecordId.toString(),
    message: delivery.message,
  };
}

function redirectWithError(request: NextRequest, message: string, fallbackPath: string) {
  const url = new URL(fallbackPath, request.nextUrl.origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateToken = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const fallbackPath = "/portals";

    if (error) {
      return redirectWithError(request, error, fallbackPath);
    }

    if (!code || !stateToken) {
      return redirectWithError(request, "Missing Google authorization response.", fallbackPath);
    }

    const state = await verifyGoogleStateToken(stateToken);
    if (!state) {
      return redirectWithError(request, "Google authorization expired. Please try again.", fallbackPath);
    }

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `${request.nextUrl.origin}/api/auth/google/callback`;

    const profile = await exchangeGoogleCodeForProfile({ code, redirectUri });
    const { db } = await connectToDatabase();

    if (state.portal === "owner") {
      const user = await ensureOwnerAccount(db, profile, state);
      if (!user) {
        return redirectWithError(request, "Unable to create or load the owner account.", "/sign-up");
      }

      const requiresPhone = !String(user.phone || "").trim();
      if (requiresPhone) {
        const pending = await createGooglePendingToken({
          userId: user._id.toString(),
          role: "propertyOwner",
          portal: "owner",
          action: state.action,
          email: profile.email,
          name: profile.name,
          phoneMissing: true,
          returnTo: state.returnTo || "/property-owner-dashboard",
          managementType: normalizeManagementType(user.managementType),
          packageTier: (user.packageTier || state.packageTier || "one_percent") as "free" | "one_percent" | "full_management",
          tier: normalizeTier(user.tier),
          requiresOtpAfterPhone: state.action === "login",
        });
        const phoneUrl = new URL("/complete-phone", request.nextUrl.origin);
        phoneUrl.searchParams.set("token", pending);
        return NextResponse.redirect(phoneUrl);
      }

      if (state.action === "login") {
        if (!shouldBypassOtp(user.email?.toString(), "propertyOwner")) {
          const challenge = await createOtpChallenge({
            db,
            user,
            role: "propertyOwner",
            collection: "propertyOwners",
            redirectPath: normalizeManagementType(user.managementType) === "airbnb"
              ? "/airbnb-dashboard"
              : "/property-owner-dashboard",
            isOwner: true,
          });

          if ("requiresPhone" in challenge) {
            const pending = await createGooglePendingToken({
              userId: user._id.toString(),
              role: "propertyOwner",
              portal: "owner",
              action: "login",
              email: profile.email,
              name: profile.name,
              phoneMissing: true,
              returnTo: normalizeManagementType(user.managementType) === "airbnb"
                ? "/airbnb-dashboard"
                : "/property-owner-dashboard",
              managementType: normalizeManagementType(user.managementType),
              packageTier: (user.packageTier || "one_percent") as "free" | "one_percent" | "full_management",
              tier: normalizeTier(user.tier),
              requiresOtpAfterPhone: true,
            });
            const phoneUrl = new URL("/complete-phone", request.nextUrl.origin);
            phoneUrl.searchParams.set("token", pending);
            return NextResponse.redirect(phoneUrl);
          }

          const otpUrl = new URL("/google-otp", request.nextUrl.origin);
          otpUrl.searchParams.set("otpId", challenge.otpId);
          otpUrl.searchParams.set(
            "returnTo",
            normalizeManagementType(user.managementType) === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard"
          );
          otpUrl.searchParams.set("role", "propertyOwner");
          return NextResponse.redirect(otpUrl);
        }
      }

      const session = await createSessionToken({
        sub: user._id.toString(),
        role: "propertyOwner",
        ownerId: user._id.toString(),
        managementType: normalizeManagementType(user.managementType),
        tier: normalizeTier(user.tier),
      });
      const response = NextResponse.redirect(
        new URL(
          state.returnTo ||
            (normalizeManagementType(user.managementType) === "airbnb"
              ? "/airbnb-dashboard"
              : "/property-owner-dashboard"),
          request.nextUrl.origin
        )
      );
      response.cookies.set("session", session, getSessionCookieOptions());
      response.cookies.set("userId", user._id.toString(), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      response.cookies.set("role", "propertyOwner", {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      response.cookies.set("managementType", normalizeManagementType(user.managementType), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      response.cookies.set("tier", normalizeTier(user.tier), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      setCsrfCookie(response, generateCsrfToken());
      return response;
    }

    if (state.portal === "tenant") {
      const tenant = await ensureTenantAccount(db, profile, state);
      if (!tenant) {
        return redirectWithError(
          request,
          "No tenant account was found for this Google email. Please sign in with your existing tenant email or contact your property manager.",
          "/tenant-login"
        );
      }

      if (!String(tenant.phone || "").trim()) {
        const pending = await createGooglePendingToken({
          userId: tenant._id.toString(),
          role: "tenant",
          portal: "tenant",
          action: state.action,
          email: profile.email,
          name: profile.name,
          phoneMissing: true,
          returnTo: state.tenantPortal === "airbnb" ? "/airbnb-tenant-dashboard" : "/tenant-dashboard",
          tenantPortal: state.tenantPortal,
          requiresOtpAfterPhone: false,
        });
        const phoneUrl = new URL("/complete-phone", request.nextUrl.origin);
        phoneUrl.searchParams.set("token", pending);
        return NextResponse.redirect(phoneUrl);
      }

      const session = await createSessionToken({
        sub: tenant._id.toString(),
        role: "tenant",
        ownerId: null,
      });
      const response = NextResponse.redirect(
        new URL(
          state.returnTo ||
            (state.tenantPortal === "airbnb" ? "/airbnb-tenant-dashboard" : "/tenant-dashboard"),
          request.nextUrl.origin
        )
      );
      response.cookies.set("session", session, getSessionCookieOptions());
      response.cookies.set("userId", tenant._id.toString(), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      response.cookies.set("role", "tenant", {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      setCsrfCookie(response, generateCsrfToken());
      return response;
    }

    const adminAccount = await ensureAdminAccount(db, profile);
    if (!adminAccount) {
      return redirectWithError(
        request,
        "No matching admin account was found for this Google email.",
        "/admin/login"
      );
    }

    const { user, collection, role } = adminAccount;
    if (!String(user.phone || "").trim()) {
      const pending = await createGooglePendingToken({
        userId: user._id.toString(),
        role,
        portal: "admin",
        action: state.action,
        email: profile.email,
        name: profile.name,
        phoneMissing: true,
        returnTo: "/admin/dashboard",
        requiresOtpAfterPhone: true,
      });
      const phoneUrl = new URL("/complete-phone", request.nextUrl.origin);
      phoneUrl.searchParams.set("token", pending);
      return NextResponse.redirect(phoneUrl);
    }

    const challenge = await createOtpChallenge({
      db,
      user,
      role,
      collection,
      redirectPath: "/admin/dashboard",
    });

    if ("requiresPhone" in challenge) {
      const pending = await createGooglePendingToken({
        userId: user._id.toString(),
        role,
        portal: "admin",
        action: state.action,
        email: profile.email,
        name: profile.name,
        phoneMissing: true,
        returnTo: "/admin/dashboard",
        requiresOtpAfterPhone: true,
      });
      const phoneUrl = new URL("/complete-phone", request.nextUrl.origin);
      phoneUrl.searchParams.set("token", pending);
      return NextResponse.redirect(phoneUrl);
    }

    const otpUrl = new URL("/google-otp", request.nextUrl.origin);
    otpUrl.searchParams.set("otpId", challenge.otpId);
    otpUrl.searchParams.set("returnTo", "/admin/dashboard");
    otpUrl.searchParams.set("role", role);
    return NextResponse.redirect(otpUrl);
  } catch (error) {
    console.error("Google auth callback error:", error);
    return NextResponse.redirect(new URL("/portals?error=google_auth_failed", request.nextUrl.origin));
  }
}

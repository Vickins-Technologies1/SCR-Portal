import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { createSessionToken, getSessionCookieOptions } from "@/lib/session";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { getDefaultPermissions } from "@/lib/permissions";
import {
  createGooglePendingToken,
  exchangeGoogleCodeForProfile,
  getGoogleRedirectUri,
  type GoogleAuthState,
  type GoogleProfile,
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

type GoogleOwnerResolution =
  | { kind: "owner"; user: any }
  | { kind: "teamMember"; user: any; owner: any }
  | { kind: "notFound" }
  | { kind: "inactive" }
  | { kind: "conflict" };

function getGoogleEmailPattern(email: string) {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

async function linkGoogleIdentity(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  collection: "propertyOwners" | "teamMembers",
  user: any,
  profile: GoogleProfile
) {
  if (user.googleId && user.googleId !== profile.id) return false;

  const linked = await db.collection(collection).updateOne(
    {
      _id: user._id,
      $or: [
        { googleId: { $exists: false } },
        { googleId: null },
        { googleId: "" },
        { googleId: profile.id },
      ],
    },
    {
      $set: {
        googleId: profile.id,
        googleEmail: profile.email,
        googlePicture: profile.picture || user.googlePicture || null,
        googleName: profile.name,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (linked.matchedCount === 0) {
    const refreshed = await db.collection(collection).findOne({ _id: user._id });
    return refreshed?.googleId === profile.id;
  }
  return true;
}

async function resolveOwnerGoogleAccount(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  profile: GoogleProfile
): Promise<GoogleOwnerResolution> {
  const owners = db.collection("propertyOwners");
  const members = db.collection("teamMembers");
  const email = getGoogleEmailPattern(profile.email.trim().toLowerCase());

  const [ownerByGoogleId, memberByGoogleId] = await Promise.all([
    owners.findOne({ googleId: profile.id }),
    members.findOne({ googleId: profile.id }),
  ]);
  if (ownerByGoogleId && memberByGoogleId) return { kind: "conflict" };
  if (ownerByGoogleId && ownerByGoogleId.role && ownerByGoogleId.role !== "propertyOwner") {
    return { kind: "conflict" };
  }

  let owner = ownerByGoogleId;
  let member = memberByGoogleId;
  if (!owner && !member) {
    [owner, member] = await Promise.all([
      owners.findOne({ email }),
      members.findOne({ email }),
    ]);
    if (owner && member) return { kind: "conflict" };
    if (owner && owner.role && owner.role !== "propertyOwner") return { kind: "conflict" };
  }

  if (member) {
    if (member.active !== true) return { kind: "inactive" };
    if (member.role !== "teamMember") return { kind: "conflict" };

    const ownerId = member.ownerId?.toString?.() ?? (typeof member.ownerId === "string" ? member.ownerId : "");
    if (!ObjectId.isValid(ownerId)) return { kind: "inactive" };
    const ownerContext = await owners.findOne({ _id: new ObjectId(ownerId), role: "propertyOwner" });
    if (!ownerContext || ownerContext.accountStatus === "suspended") return { kind: "inactive" };
    if (!(await linkGoogleIdentity(db, "teamMembers", member, profile))) return { kind: "conflict" };
    return { kind: "teamMember", user: member, owner: ownerContext };
  }

  if (owner) {
    if (owner.accountStatus === "suspended") return { kind: "inactive" };
    if (!(await linkGoogleIdentity(db, "propertyOwners", owner, profile))) return { kind: "conflict" };
    return { kind: "owner", user: owner };
  }

  return { kind: "notFound" };
}

async function createOwnerAccount(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  profile: GoogleProfile,
  state: GoogleAuthState
) {
  const defaults = getDefaultOwnerPayload(state);
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
  collection: "tenants" | "propertyOwners" | "teamMembers" | "adminTeamMembers";
  redirectPath: string;
  isOwner?: boolean;
  isTeamMember?: boolean;
  appHash?: string;
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
    appHash: params.appHash,
  });

  const delivery = await deliverOtp({
    email: otpEmail,
    phone: otpPhone,
    name: params.user.name || "User",
    code: otpCode,
    appHash: params.appHash,
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

    const redirectUri = getGoogleRedirectUri({ origin: request.nextUrl.origin, platform: state.platform });

    const profile = await exchangeGoogleCodeForProfile({ code, redirectUri });
    if (profile.emailVerified !== true) {
      return redirectWithError(request, "Google must verify this email before it can be used to sign in.", state.portal === "owner" ? "/portals/owner" : fallbackPath);
    }

    const { db } = await connectToDatabase();

    if (state.portal === "owner") {
      const resolution = await resolveOwnerGoogleAccount(db, profile);
      if (resolution.kind === "inactive") {
        return redirectWithError(request, "This team member or owner account is inactive. Contact the property owner or support.", "/portals/owner");
      }
      if (resolution.kind === "conflict") {
        return redirectWithError(request, "This Google account matches conflicting accounts. Contact support to secure the account.", "/portals/owner");
      }

      let user: any;
      let ownerContext: any;
      let isTeamMember = false;
      let isNewOwner = false;

      if (resolution.kind === "teamMember") {
        user = resolution.user;
        ownerContext = resolution.owner;
        isTeamMember = true;
      } else if (resolution.kind === "owner") {
        user = resolution.user;
        ownerContext = resolution.user;
      } else {
        if (state.action !== "signup") {
          return redirectWithError(request, "No owner or team member account was found for this Google email. Please sign up or use the email associated with your account.", "/portals/owner");
        }

        const email = getGoogleEmailPattern(profile.email.trim().toLowerCase());
        const existingOtherAccount = await Promise.all([
          db.collection("users").findOne({ email }),
          db.collection("tenants").findOne({ email }),
          db.collection("adminTeamMembers").findOne({ email }),
        ]);
        if (existingOtherAccount.some(Boolean)) {
          return redirectWithError(request, "An account already uses this Google email on another portal. Please sign in to that account.", "/portals/owner");
        }

        user = await createOwnerAccount(db, profile, state);
        if (!user) return redirectWithError(request, "Unable to create the owner account.", "/sign-up");
        ownerContext = user;
        isNewOwner = true;
      }

      const role = isTeamMember ? "teamMember" : "propertyOwner";
      const ownerId = isTeamMember
        ? (user.ownerId?.toString?.() ?? String(user.ownerId))
        : user._id.toString();
      const managementType = normalizeManagementType(ownerContext.managementType);
      const tier = normalizeTier(ownerContext.tier);
      const dashboardPath = managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
      const permissions = isTeamMember
        ? Array.isArray(user.permissions) ? user.permissions : getDefaultPermissions(role, true)
        : getDefaultPermissions("propertyOwner");

      if (isTeamMember && !String(user.phone || "").trim()) {
        return redirectWithError(request, "Your team member account needs a phone number before Google sign-in. Ask the property owner to update your account.", "/portals/owner");
      }

      if (!isTeamMember && !String(user.phone || "").trim()) {
        const pending = await createGooglePendingToken({
          userId: user._id.toString(),
          role: "propertyOwner",
          portal: "owner",
          action: state.action,
          appHash: state.appHash,
          email: profile.email,
          name: profile.name,
          phoneMissing: true,
          returnTo: state.returnTo || dashboardPath,
          managementType,
          packageTier: (user.packageTier || state.packageTier || "one_percent") as "free" | "one_percent" | "full_management" | "lifetime",
          tier,
          requiresOtpAfterPhone: state.action === "login",
        });
        const phoneUrl = new URL("/complete-phone", request.nextUrl.origin);
        phoneUrl.searchParams.set("token", pending);
        return NextResponse.redirect(phoneUrl);
      }

      const requiresOtp = !isNewOwner && !shouldBypassOtp(user.email?.toString(), role);
      if (requiresOtp) {
        const challenge = await createOtpChallenge({
          db,
          user,
          role,
          collection: isTeamMember ? "teamMembers" : "propertyOwners",
          redirectPath: dashboardPath,
          isOwner: !isTeamMember,
          isTeamMember,
          appHash: state.appHash,
        });

        if ("requiresPhone" in challenge) {
          return redirectWithError(request, "Email and phone are required for secure sign-in. Contact the property owner to update your account.", "/portals/owner");
        }

        const otpUrl = new URL("/google-otp", request.nextUrl.origin);
        otpUrl.searchParams.set("otpId", challenge.otpId);
        otpUrl.searchParams.set("returnTo", dashboardPath);
        otpUrl.searchParams.set("role", role);
        return NextResponse.redirect(otpUrl);
      }

      const session = await createSessionToken({
        sub: user._id.toString(),
        role,
        ownerId,
        managementType,
        tier,
      });
      const response = NextResponse.redirect(new URL(isTeamMember ? dashboardPath : state.returnTo || dashboardPath, request.nextUrl.origin));
      const cookieOptions = {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      };
      response.cookies.set("session", session, getSessionCookieOptions());
      response.cookies.set("userId", user._id.toString(), cookieOptions);
      response.cookies.set("role", role, cookieOptions);
      response.cookies.set("permissions", JSON.stringify(permissions), cookieOptions);
      response.cookies.set("managementType", managementType, cookieOptions);
      response.cookies.set("tier", tier, cookieOptions);
      if (isTeamMember) response.cookies.set("ownerId", ownerId, cookieOptions);
      else response.cookies.delete("ownerId");
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
          appHash: state.appHash,
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
        appHash: state.appHash,
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
      appHash: state.appHash,
    });

    if ("requiresPhone" in challenge) {
      const pending = await createGooglePendingToken({
        userId: user._id.toString(),
        role,
        portal: "admin",
        action: state.action,
        appHash: state.appHash,
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

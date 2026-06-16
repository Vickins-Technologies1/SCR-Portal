import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { createSessionToken, getSessionCookieOptions } from "@/lib/session";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { verifyGooglePendingToken } from "@/lib/google-auth";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
} from "@/lib/otp";
import { deliverOtp } from "@/lib/otp-delivery";

const OTP_COLLECTION = "otpChallenges";

function normalizePhone(input: string): string {
  const raw = input.trim().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+254${digits.slice(1)}`;
  }
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) {
    return `+254${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return raw;
}

async function createOtpChallenge(params: {
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"];
  user: any;
  role: string;
  collection: "tenants" | "propertyOwners" | "adminTeamMembers";
  redirectPath: string;
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
    isTeamMember: false,
    isOwner: params.role === "propertyOwner",
    ownerId: params.role === "propertyOwner" ? params.user._id.toString() : null,
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
    message: delivery.emailSent
      ? "OTP sent to your email and phone."
      : "OTP sent via SMS only. Email delivery failed.",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    const phone = typeof body?.phone === "string" ? body.phone : "";

    if (!token || !phone.trim()) {
      return NextResponse.json(
        { success: false, message: "Phone number and verification token are required." },
        { status: 400 }
      );
    }

    const pending = await verifyGooglePendingToken(token);
    if (!pending) {
      return NextResponse.json(
        { success: false, message: "Phone verification session expired. Please start again." },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!/^\+\d{10,15}$/.test(normalizedPhone)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid phone number in international format." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const collectionName =
      pending.role === "propertyOwner" ? "propertyOwners" : pending.role === "tenant" ? "tenants" : "adminTeamMembers";

    const user = await db.collection(collectionName).findOne({
      _id: new ObjectId(pending.userId),
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Account not found. Please start Google sign-in again." },
        { status: 404 }
      );
    }

    const duplicatePhone = await db.collection(collectionName).findOne({
      phone: normalizedPhone,
      _id: { $ne: new ObjectId(pending.userId) },
    });
    if (duplicatePhone) {
      return NextResponse.json(
        { success: false, message: "That phone number is already in use on this portal." },
        { status: 409 }
      );
    }

    await db.collection(collectionName).updateOne(
      { _id: new ObjectId(pending.userId) },
      {
        $set: {
          phone: normalizedPhone,
          googlePhoneVerifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const refreshedUser = await db.collection(collectionName).findOne({
      _id: new ObjectId(pending.userId),
    });

    if (!refreshedUser) {
      return NextResponse.json({ success: false, message: "Unable to complete profile setup." }, { status: 500 });
    }

    const redirectPath =
      pending.returnTo ||
      (pending.portal === "owner"
        ? String(refreshedUser.managementType) === "airbnb"
          ? "/airbnb-dashboard"
          : "/property-owner-dashboard"
        : pending.portal === "tenant"
          ? pending.tenantPortal === "airbnb"
            ? "/airbnb-tenant-dashboard"
            : "/tenant-dashboard"
          : "/admin/dashboard");

    if (pending.requiresOtpAfterPhone) {
      const otpRedirect =
        pending.portal === "owner"
          ? String(refreshedUser.managementType) === "airbnb"
            ? "/airbnb-dashboard"
            : "/property-owner-dashboard"
          : pending.portal === "tenant"
            ? pending.tenantPortal === "airbnb"
              ? "/airbnb-tenant-dashboard"
              : "/tenant-dashboard"
            : "/admin/dashboard";

      const challenge = await createOtpChallenge({
        db,
        user: refreshedUser,
        role: pending.role,
        collection: collectionName as "tenants" | "propertyOwners" | "adminTeamMembers",
        redirectPath: otpRedirect,
      });

      if ("requiresPhone" in challenge) {
        return NextResponse.json(
          { success: false, message: "Please update your account email before continuing." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Phone number saved successfully.",
        requiresOtp: true,
        otpId: challenge.otpId,
        redirect: `/google-otp?otpId=${encodeURIComponent(challenge.otpId)}&returnTo=${encodeURIComponent(otpRedirect)}&role=${encodeURIComponent(pending.role)}`,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "Phone number saved successfully.",
      redirect: redirectPath,
    });

    const managementType = String(refreshedUser.managementType) === "airbnb" ? "airbnb" : "rentals";
    const tier = String(refreshedUser.tier) === "free" ? "free" : "premium";
    const session = await createSessionToken({
      sub: refreshedUser._id.toString(),
      role: pending.role,
      ownerId: pending.portal === "owner" || pending.role === "propertyOwner" ? refreshedUser._id.toString() : null,
      managementType: pending.portal === "owner" ? managementType : undefined,
      tier: pending.portal === "owner" ? tier : undefined,
    });

    response.cookies.set("session", session, getSessionCookieOptions());
    response.cookies.set("userId", refreshedUser._id.toString(), {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    response.cookies.set("role", pending.role, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    if (pending.portal === "owner") {
      response.cookies.set("managementType", managementType, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      response.cookies.set("tier", tier, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
    }
    setCsrfCookie(response, generateCsrfToken());
    return response;
  } catch (error) {
    console.error("Google phone completion error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

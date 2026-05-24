// src/app/api/auth/otp/verify/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getDefaultPermissions } from "@/lib/permissions";
import { hashOtpCode } from "@/lib/otp";
import { createSessionToken, getSessionCookieOptions } from "@/lib/session";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { resolveAccountTier, type AccountTier } from "@/lib/tier";

type OtpDoc = {
  _id: ObjectId;
  userId: string;
  role: string;
  isTeamMember?: boolean;
  isOwner?: boolean;
  ownerId?: string | null;
  email: string;
  phone: string;
  purpose: "login";
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  redirectPath?: string;
  collection: "tenants" | "propertyOwners" | "teamMembers" | "adminTeamMembers";
  lastSentAt?: Date;
  resendCount?: number;
};

const normalizeManagementType = (value: unknown): "rentals" | "airbnb" => {
  if (typeof value !== "string") return "rentals";
  const normalized = value.trim().toLowerCase();
  return normalized === "airbnb" ? "airbnb" : "rentals";
};

const normalizeOwnerTier = (value: unknown): AccountTier => resolveAccountTier(value, "premium");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const otpId = body?.otpId?.toString();
    const code = body?.code?.toString().trim();

    if (!otpId || !code) {
      return NextResponse.json(
        { success: false, message: "OTP code and request ID are required." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    if (!ObjectId.isValid(otpId)) {
      return NextResponse.json(
        { success: false, message: "Invalid OTP request ID." },
        { status: 400 }
      );
    }

    const otpObjectId = new ObjectId(otpId);
    const otp = await db.collection<OtpDoc>("otpChallenges").findOne({
      _id: otpObjectId,
      purpose: "login",
    });

    if (!otp) {
      return NextResponse.json(
        { success: false, message: "OTP request not found or expired." },
        { status: 404 }
      );
    }

    const now = new Date();
    if (otp.expiresAt && now > new Date(otp.expiresAt)) {
      await db.collection("otpChallenges").deleteOne({ _id: otpObjectId });
      return NextResponse.json(
        { success: false, message: "OTP expired. Please log in again." },
        { status: 400 }
      );
    }

    if (otp.attempts >= otp.maxAttempts) {
      return NextResponse.json(
        { success: false, message: "Too many invalid attempts. Please log in again." },
        { status: 429 }
      );
    }

    if (hashOtpCode(code) !== otp.codeHash) {
      await db.collection("otpChallenges").updateOne(
        { _id: otpObjectId },
        { $inc: { attempts: 1 } }
      );
      return NextResponse.json(
        { success: false, message: "Invalid OTP code." },
        { status: 401 }
      );
    }

    const user = await db.collection(otp.collection).findOne({
      _id: new ObjectId(otp.userId),
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User account not found." },
        { status: 404 }
      );
    }

    // Note: Property owners are no longer gated behind admin approval.

    const isTeamMember = otp.collection === "teamMembers" || otp.isTeamMember;
    const isOwner = otp.collection === "propertyOwners" && otp.role === "propertyOwner";
    const isAdminTeamMember = otp.collection === "adminTeamMembers" || otp.role === "adminTeamMember";

    let redirectPath = otp.redirectPath;
    let ownerManagementType: "rentals" | "airbnb" | null = null;
    let ownerTier: AccountTier | null = null;
    if (otp.role === "propertyOwner" || isTeamMember) {
      let managementType: "rentals" | "airbnb" = "rentals";
      if (isTeamMember) {
        const ownerId = user?.ownerId?.toString?.() ?? (typeof user?.ownerId === "string" ? user.ownerId : null);
        if (ownerId && ObjectId.isValid(ownerId)) {
          const owner = await db.collection("propertyOwners").findOne(
            { _id: new ObjectId(ownerId) },
            { projection: { managementType: 1, tier: 1 } }
          );
          managementType = normalizeManagementType(owner?.managementType);
          ownerTier = normalizeOwnerTier(owner?.tier);
        }
      } else {
        managementType = normalizeManagementType(user?.managementType);
        ownerTier = normalizeOwnerTier(user?.tier);
      }
      ownerManagementType = managementType;
      redirectPath = managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
    }

    if (!redirectPath) {
      redirectPath =
        otp.role === "admin" || isAdminTeamMember
          ? "/admin/dashboard"
          : otp.role === "tenant"
            ? "/tenant-dashboard"
            : "/property-owner-dashboard";
    }

    let finalPermissions: string[] = [];

    if (otp.role === "propertyOwner") {
      finalPermissions = getDefaultPermissions("propertyOwner");
    } else if (isTeamMember) {
      finalPermissions = Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : getDefaultPermissions(otp.role, true);
    } else if (isAdminTeamMember) {
      finalPermissions = Array.isArray(user.permissions) ? user.permissions : [];
    } else if (otp.role === "tenant") {
      finalPermissions = getDefaultPermissions("tenant");
    }

    const response = new NextResponse(
      JSON.stringify({
        success: true,
        userId: user._id.toString(),
        role: otp.role,
        redirect: redirectPath,
        isTeamMember,
        isOwner,
        permissions: finalPermissions,
        tier: ownerTier,
        adminName: (otp.role === "admin" || isAdminTeamMember) ? (user?.name?.toString?.() || "Admin") : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    const sessionToken = await createSessionToken({
      sub: user._id.toString(),
      role: otp.role,
      ownerId: isTeamMember ? user.ownerId?.toString() ?? null : otp.role === "propertyOwner" ? user._id.toString() : null,
      managementType: ownerManagementType,
      tier: ownerTier,
    });
    response.cookies.set("session", sessionToken, getSessionCookieOptions());

    response.cookies.set("userId", user._id.toString(), {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    response.cookies.set("role", otp.role, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    if (finalPermissions.length > 0) {
      response.cookies.set("permissions", JSON.stringify(finalPermissions), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
    }

    if (ownerManagementType) {
      response.cookies.set("managementType", ownerManagementType, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
    }

    if (ownerTier) {
      response.cookies.set("tier", ownerTier, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
    }

    if (isTeamMember && user.ownerId) {
      response.cookies.set("ownerId", user.ownerId.toString(), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
    }

    setCsrfCookie(response, generateCsrfToken());

    await db.collection(otp.collection).updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: now } }
    );

    await db.collection("otpChallenges").deleteOne({ _id: otpObjectId });

    return response;
  } catch (error) {
    console.error("OTP verification error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

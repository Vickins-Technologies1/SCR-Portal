// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { deliverOtp } from "../../../../lib/otp-delivery";
import { createSessionToken, getSessionCookieOptions } from "../../../../lib/session";
import { normalizeAdminPermissions } from "../../../../lib/admin-permissions";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_REQUIRE_AFTER_MS,
  shouldBypassOtp,
} from "../../../../lib/otp";

const OTP_COLLECTION = "otpChallenges";

export async function POST(request: Request) {
  let email: string | null = null;

  try {
    const body = await request.json();
    email = body.email?.trim().toLowerCase();
    const { password, role } = body;

    if (!email || !password || role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();

    let user: any | null = await db.collection("propertyOwners").findOne({
      email,
      role: "admin",
    });

    let userCollection: "propertyOwners" | "adminTeamMembers" = "propertyOwners";
    let finalRole: "admin" | "adminTeamMember" = "admin";

    if (!user) {
      user = await db.collection("adminTeamMembers").findOne({
        email,
        role: "adminTeamMember",
        active: true,
      });
      if (user) {
        userCollection = "adminTeamMembers";
        finalRole = "adminTeamMember";
      }
    }

    if (!user) {
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 });
    }

    const now = new Date();
    const lastLoginAt = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
    const requiresOtp = !shouldBypassOtp(user.email?.toString(), finalRole);

    if (requiresOtp) {
      const otpEmail = user.email?.toString();
      const otpPhone = user.phone?.toString();

      if (!otpEmail || !otpPhone) {
        return NextResponse.json(
          { success: false, message: "Email and phone number are required for OTP login." },
          { status: 400 }
        );
      }

      const otpCode = generateOtpCode();
      const otpRecordId = new ObjectId();

      await db.collection(OTP_COLLECTION).deleteMany({
        userId: user._id.toString(),
        purpose: "login",
      });

      await db.collection(OTP_COLLECTION).insertOne({
        _id: otpRecordId,
        userId: user._id.toString(),
        role: finalRole,
        isTeamMember: false,
        isOwner: false,
        ownerId: null,
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
        redirectPath: "/admin/dashboard",
        collection: userCollection,
      });

      let delivery;
      try {
        delivery = await deliverOtp({
          email: otpEmail,
          phone: otpPhone,
          name: user.name || "Admin",
          code: otpCode,
        });
      } catch (sendErr) {
        await db.collection(OTP_COLLECTION).deleteOne({ _id: otpRecordId });
        console.error("OTP delivery failed:", sendErr);
        return NextResponse.json(
          {
            success: false,
            message: sendErr instanceof Error ? sendErr.message : "Failed to send OTP. Please try again.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          requiresOtp: true,
          otpId: otpRecordId.toString(),
          message: delivery?.emailSent
            ? "OTP sent to your email and phone."
            : "OTP sent via SMS only. Email delivery failed.",
        },
        { status: 200 }
      );
    }

    // ── Success ────────────────────────────────────────────────
    const finalPermissions =
      finalRole === "adminTeamMember"
        ? normalizeAdminPermissions(user.permissions)
        : [];

    const response = NextResponse.json({
      success: true,
      userId: user._id.toString(),
      role: finalRole,
      redirect: "/admin/dashboard",
      permissions: finalPermissions,
      adminName: user?.name?.toString?.() || "Admin",
    });

    const sessionToken = await createSessionToken({
      sub: user._id.toString(),
      role: finalRole,
      ownerId: null,
    });
    response.cookies.set("session", sessionToken, getSessionCookieOptions());

    const clientCookieOptions = {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const, // better UX than 'strict'
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    };

    response.cookies.set("userId", user._id.toString(), clientCookieOptions);
    response.cookies.set("role", finalRole, clientCookieOptions);
    response.cookies.set("permissions", JSON.stringify(finalPermissions), clientCookieOptions);
    response.cookies.set("adminName", user?.name?.toString?.() || "Admin", clientCookieOptions);

    await db.collection(userCollection).updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

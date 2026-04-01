// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { deliverOtp } from "../../../../lib/otp-delivery";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_REQUIRE_AFTER_MS,
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

    const user = await db.collection("propertyOwners").findOne({
      email,
      role: "admin",
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const now = new Date();
    const lastLoginAt = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
    const requiresOtp =
      !lastLoginAt || Number.isNaN(lastLoginAt.getTime())
        ? true
        : now.getTime() - lastLoginAt.getTime() > OTP_REQUIRE_AFTER_MS;

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
        role: user.role,
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
        collection: "propertyOwners",
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
    const response = NextResponse.json({
      success: true,
      userId: user._id.toString(),
      role: user.role,
      redirect: "/admin/dashboard",
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,          // better UX than 'strict'
      maxAge: 7 * 24 * 60 * 60,          // 7 days
      path: "/",
    };

    response.cookies.set("userId", user._id.toString(), cookieOptions);
    response.cookies.set("role", user.role, cookieOptions);

    await db.collection("propertyOwners").updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: now } }
    );

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

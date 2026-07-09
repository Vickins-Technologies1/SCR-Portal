// src/app/api/auth/otp/resend/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { deliverOtp } from "@/lib/otp-delivery";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EXPIRY_MS,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_MS,
} from "@/lib/otp";

type OtpDoc = {
  _id: ObjectId;
  userId: string;
  role: string;
  email: string;
  phone: string;
  purpose: "login";
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  redirectPath?: string;
  collection: "tenants" | "propertyOwners" | "teamMembers";
  lastSentAt?: Date;
  resendCount?: number;
  appHash?: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const otpId = body?.otpId?.toString();

    if (!otpId) {
      return NextResponse.json(
        { success: false, message: "OTP request ID is required." },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(otpId)) {
      return NextResponse.json(
        { success: false, message: "Invalid OTP request ID." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
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

    const resendCount = otp.resendCount ?? 0;
    if (resendCount >= OTP_MAX_RESENDS) {
      return NextResponse.json(
        { success: false, message: "Resend limit reached. Please log in again." },
        { status: 429 }
      );
    }

    if (otp.lastSentAt) {
      const elapsed = now.getTime() - new Date(otp.lastSentAt).getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterMs = OTP_RESEND_COOLDOWN_MS - elapsed;
        return NextResponse.json(
          { success: false, message: "Please wait before requesting another OTP.", retryAfterMs },
          { status: 429 }
        );
      }
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

    const otpEmail = user.email?.toString();
    const otpPhone = user.phone?.toString();

    if (!otpEmail || !otpPhone) {
      return NextResponse.json(
        { success: false, message: "Email and phone number are required for OTP login." },
        { status: 400 }
      );
    }

    const newCode = generateOtpCode();
    const oldCodeHash = otp.codeHash;
    const oldExpiresAt = otp.expiresAt;
    const oldLastSentAt = otp.lastSentAt;
    const oldResendCount = resendCount;

    await db.collection("otpChallenges").updateOne(
      { _id: otpObjectId },
      {
        $set: {
          codeHash: hashOtpCode(newCode),
          expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
          lastSentAt: now,
        },
        $inc: { resendCount: 1 },
      }
    );

    let delivery;
    try {
      delivery = await deliverOtp({
        email: otpEmail,
        phone: otpPhone,
        name: user.name || "User",
        code: newCode,
        appHash: otp.appHash,
      });
    } catch (sendErr) {
      await db.collection("otpChallenges").updateOne(
        { _id: otpObjectId },
        {
          $set: {
            codeHash: oldCodeHash,
            expiresAt: oldExpiresAt,
            lastSentAt: oldLastSentAt ?? null,
            resendCount: oldResendCount,
          },
        }
      );
      console.error("OTP resend delivery failed:", sendErr);
      return NextResponse.json(
        {
          success: false,
          message: sendErr instanceof Error ? sendErr.message : "Failed to resend OTP. Please try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: delivery.message,
      retryAfterMs: OTP_RESEND_COOLDOWN_MS,
    });
  } catch (error) {
    console.error("OTP resend error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

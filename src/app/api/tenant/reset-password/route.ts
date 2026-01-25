// src/app/api/tenant/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, email, newPassword } = await req.json();

    if (!token || !email || !newPassword || newPassword.length < 8) {
      return NextResponse.json({ success: false, message: "Invalid input" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const resetDoc = await db.collection("passwordResets").findOne({
      token,
      email,
      expiresAt: { $gt: new Date() },
      used: false,
    });

    if (!resetDoc) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await Promise.all([
      // Update password
      db.collection("tenants").updateOne(
        { _id: resetDoc.tenantId },
        { $set: { password: hashed, updatedAt: new Date() } }
      ),
      // Mark token as used
      db.collection("passwordResets").updateOne(
        { _id: resetDoc._id },
        { $set: { used: true } }
      ),
    ]);

    return NextResponse.json({ success: true, message: "Password reset successful" });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
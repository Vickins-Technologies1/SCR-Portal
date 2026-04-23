// src/app/api/owner/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(req: NextRequest) {
  try {
    const { token, email, newPassword } = await req.json();

    if (!token || !email || !newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing fields" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    const resetDoc = await db.collection("passwordResets").findOne({
      token,
      expiresAt: { $gt: now },
      used: false,
      ...(email && typeof email === "string"
        ? { email: { $regex: `^${escapeRegex(email.trim())}$`, $options: "i" } }
        : {}),
      $or: [{ role: "owner" }, { role: "propertyOwner" }, { ownerId: { $exists: true } }],
    });

    if (!resetDoc) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const ownerId =
      resetDoc.ownerId instanceof ObjectId ? resetDoc.ownerId : new ObjectId(resetDoc.ownerId);

    const hashed = await bcrypt.hash(newPassword, 10);

    await Promise.all([
      db.collection("propertyOwners").updateOne(
        { _id: ownerId },
        { $set: { password: hashed, updatedAt: new Date().toISOString() } }
      ),
      db.collection("passwordResets").updateOne(
        { _id: resetDoc._id },
        { $set: { used: true, usedAt: now } }
      ),
    ]);

    return NextResponse.json({ success: true, message: "Password reset successful" });
  } catch (err: any) {
    console.error("Owner password reset error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong" },
      { status: 500 }
    );
  }
}

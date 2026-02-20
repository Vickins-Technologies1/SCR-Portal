// src/app/api/tenant/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import bcrypt from "bcryptjs";

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

    // ── Important: use Date object for comparison ────────────────────────
    const now = new Date();

    const resetDoc = await db.collection("passwordResets").findOne({
      token,
      email,
      expiresAt: { $gt: now },     // ← real Date vs real Date
      used: false,
    });

    if (!resetDoc) {
      // Optional: help yourself debug in development
      if (process.env.NODE_ENV !== "production") {
        const existing = await db.collection("passwordResets").findOne({ token, email });
        if (existing) {
          console.log("Found token, but:", {
            used: existing.used,
            expiresAt: existing.expiresAt,
            now,
            stillValidForMs: existing.expiresAt ? existing.expiresAt.getTime() - now.getTime() : -1,
          });
        }
      }

      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await Promise.all([
      db.collection("tenants").updateOne(
        { _id: resetDoc.tenantId },
        { $set: { password: hashed, updatedAt: now } }
      ),
      db.collection("passwordResets").updateOne(
        { _id: resetDoc._id },
        { $set: { used: true, usedAt: now } } // ← nice to have
      ),
    ]);

    return NextResponse.json({ success: true, message: "Password reset successful" });

  } catch (err: any) {
    console.error("Password reset error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong" },
      { status: 500 }
    );
  }
}
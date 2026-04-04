// src/app/api/tenant/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(req: NextRequest) {
  try {
    const { token, email, newPassword } = await req.json();

    if (!token || !newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing fields" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // ── Important: use Date object for comparison ────────────────────────
    const now = new Date();

    const resetQuery: any = {
      token,
      used: false,
      $or: [{ role: "tenant" }, { tenantId: { $exists: true } }],
    };

    if (email && typeof email === "string") {
      resetQuery.email = { $regex: `^${escapeRegex(email.trim())}$`, $options: "i" };
    }

    const resetDoc = await db.collection("passwordResets").findOne(resetQuery);

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

    const expiresAt = resetDoc.expiresAt ? new Date(resetDoc.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    let tenantId = resetDoc.tenantId;
    if (!tenantId && resetDoc.email) {
      const fallbackTenant = await db.collection("tenants").findOne({
        email: { $regex: `^${escapeRegex(String(resetDoc.email))}$`, $options: "i" },
      });
      tenantId = fallbackTenant?._id;
    }

    if (!tenantId && email) {
      const fallbackTenant = await db.collection("tenants").findOne({
        email: { $regex: `^${escapeRegex(String(email))}$`, $options: "i" },
      });
      tenantId = fallbackTenant?._id;
    }

    if (!tenantId) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const tenantObjectId =
      tenantId instanceof ObjectId ? tenantId : (ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : null);

    if (!tenantObjectId) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await Promise.all([
      db.collection("tenants").updateOne(
        { _id: tenantObjectId },
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

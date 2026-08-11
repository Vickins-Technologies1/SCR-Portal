// src/app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { cascadeDeleteOwner } from "../../../../../lib/admin-owner-delete";
import { requireAdmin } from "../../../../../lib/admin-auth";
import bcrypt from "bcryptjs";
import validator from "validator";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../../lib/csrf";
import {
  buildSafeOwnerResponse,
  validateOwnerPassword,
} from "@/lib/admin-owner-credentials";
import { findAnyExistingEmail, isDuplicateKeyError, normalizeEmail } from "@/lib/email-identity";

function assertCsrf(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin(request, "admin:owners:view");
  if (auth instanceof NextResponse) return auth;

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const owner = await db
      .collection("propertyOwners")
      .findOne({ _id: new ObjectId(id) });

    if (!owner) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      propertyOwner: buildSafeOwnerResponse(owner),
    });
  } catch (error) {
    console.error("User fetch error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin(request, "admin:owners:manage");
  if (auth instanceof NextResponse) return auth;

  const csrfError = assertCsrf(request);
  if (csrfError) return csrfError;

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, email, phone } = body;

    const { db } = await connectToDatabase();

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name) updateData.name = String(name).trim();
    if (email) {
      const normalizedEmail = normalizeEmail(email);
      const existing = await findAnyExistingEmail(db, normalizedEmail, { excludeId: id });
      if (existing) {
        return NextResponse.json(
          { success: false, message: "This email is already associated with another account." },
          { status: 409 }
        );
      }
      updateData.email = normalizedEmail;
    }
    if (phone) updateData.phone = String(phone).trim();
    if (typeof body.password === "string") {
      const nextPassword = body.password.trim();
      if (nextPassword) {
        const passwordError = validateOwnerPassword(nextPassword);
        if (passwordError) {
          return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
        }
        updateData.password = await bcrypt.hash(nextPassword, 10);
      }
    }

    let result;
    try {
      result = await db
        .collection("propertyOwners")
        .findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { returnDocument: "after" }
        );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return NextResponse.json({ success: false, message: "Email already exists" }, { status: 409 });
      }
      throw error;
    }

    const updatedOwner = (result as any)?.value ?? result;

    if (!updatedOwner) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Property owner credentials updated successfully.",
      propertyOwner: buildSafeOwnerResponse(updatedOwner),
    });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin(request, "admin:owners:manage");
  if (auth instanceof NextResponse) return auth;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID" },
      { status: 400 }
    );
  }

  const userObjectId = new ObjectId(id);
  try {
    const { db, client } = await connectToDatabase();
    const owner = await db.collection("propertyOwners").findOne({ _id: userObjectId });
    if (!owner) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const deletedCounts = await cascadeDeleteOwner({ db, client, ownerId: id });
    if (deletedCounts.owner === 0) {
      return NextResponse.json(
        { success: false, message: "Delete failed" },
        { status: 500 }
      );
    }

    console.log(`User ${id} fully deleted:`, deletedCounts);

    return NextResponse.json({
      success: true,
      message: "User and all related data deleted",
      deleted: deletedCounts,
    });
  } catch (error) {
    console.error("Cascade delete failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete user" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { cascadeDeleteOwner } from "../../../../../lib/admin-owner-delete";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import validator from "validator";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../../lib/csrf";
import { buildSafeOwnerResponse, validateOwnerPassword } from "@/lib/admin-owner-credentials";
import { findAnyExistingEmail, isDuplicateKeyError, normalizeEmail } from "@/lib/email-identity";

function assertCsrf(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }
  return null;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireAdmin(request, "admin:owners:manage");
  if (auth instanceof NextResponse) return auth;

  const csrfError = assertCsrf(request);
  if (csrfError) return csrfError;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  try {
    const { db, client } = await connectToDatabase();

    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(id) });
    if (!owner) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const deleted = await cascadeDeleteOwner({ db, client, ownerId: id });

    if (deleted.owner === 0) {
      return NextResponse.json({ success: false, message: "Delete failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Owner and related data deleted",
      deleted,
    });
  } catch (error) {
    console.error("Delete owner error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
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

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(id) });
  if (!owner) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const nextName = normalizeText(body.name);
    if (nextName) update.name = nextName;
  }

  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const nextPhone = normalizeText(body.phone);
    if (nextPhone) update.phone = nextPhone;
  }

  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    const nextEmailRaw = normalizeText(body.email);
    if (!nextEmailRaw) {
      return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 });
    }

    const nextEmail = normalizeEmail(nextEmailRaw);
    if (!validator.isEmail(nextEmail)) {
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    const existing = await findAnyExistingEmail(db, nextEmail, { excludeId: id });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "This email is already associated with another account." },
        { status: 409 }
      );
    }

    update.email = nextEmail;
  }

  if (Object.prototype.hasOwnProperty.call(body, "password")) {
    const nextPassword = normalizeText(body.password);
    if (nextPassword) {
      const passwordError = validateOwnerPassword(nextPassword);
      if (passwordError) {
        return NextResponse.json({ success: false, message: passwordError }, { status: 400 });
      }
      update.password = await bcrypt.hash(nextPassword, 10);
    }
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ success: false, message: "No changes provided" }, { status: 400 });
  }

  try {
    const result = await db.collection("propertyOwners").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );

    const updatedOwner = (result as any)?.value ?? result;
    if (!updatedOwner) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Property owner credentials updated successfully.",
      propertyOwner: buildSafeOwnerResponse(updatedOwner),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { success: false, message: "This email is already associated with another account." },
        { status: 409 }
      );
    }

    console.error("Owner credential update error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

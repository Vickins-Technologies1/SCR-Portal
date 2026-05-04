// src/app/api/tenant/change-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import logger from "../../../../lib/logger";
import bcrypt from "bcrypt";

interface Tenant {
  _id: ObjectId;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: Date;
}

interface ChangePasswordRequestBody {
  tenantId: string;
  password: string;
}

export async function POST(request: NextRequest) {
  const now = new Date();
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  let body: ChangePasswordRequestBody | null = null;

  if (!userId || !role) {
    logger.warn("Unauthorized access attempt (missing auth cookies)", { userId, role, at: now.toISOString() });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // CSRF validation
  if (!validateCsrfToken(request, csrfToken)) {
    logger.warn("Invalid CSRF token", { userId, role, at: now.toISOString() });
    return buildInvalidCsrfResponse(request);
  }

  try {
    body = await request.json().catch(() => null);
    if (!body) {
      logger.warn("Invalid request body", { userId, role, at: now.toISOString() });
      return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    }

    const { tenantId, password } = body;

    // Input validation
    if (!tenantId) {
      logger.warn("Missing tenantId", { userId, role, at: now.toISOString() });
      return NextResponse.json({ success: false, message: "Missing tenantId" }, { status: 400 });
    }
    if (!ObjectId.isValid(tenantId)) {
      logger.warn("Invalid tenantId", { userId, role, tenantId, at: now.toISOString() });
      return NextResponse.json({ success: false, message: "Invalid tenantId" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      logger.warn("Invalid password", { userId, role, at: now.toISOString() });
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();

    if (role === "tenant") {
      if (tenantId !== userId) {
        logger.warn("User ID mismatch", { userId, tenantId, role, at: now.toISOString() });
        return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 403 });
      }
    } else if (role === "propertyOwner") {
      // Landlords can only change a tenant password while actively impersonating that tenant.
      if (!isImpersonating || !impersonatingTenantId || impersonatingTenantId !== tenantId) {
        logger.warn("Owner attempted password change without valid impersonation context", {
          userId,
          role,
          isImpersonating,
          impersonatingTenantId,
          tenantId,
          at: now.toISOString(),
        });
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }

      if (!ObjectId.isValid(userId)) {
        logger.warn("Invalid owner userId", { userId, role, at: now.toISOString() });
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
      }

      const tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
        ownerId: userId,
      });

      if (!tenant) {
        logger.warn("Tenant not found or not owned by requester", {
          ownerId: userId,
          tenantId,
          at: now.toISOString(),
        });
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }
    } else {
      logger.warn("Invalid role for change-password", { userId, role, at: now.toISOString() });
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update tenant's password
    const updateResult = await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      { $set: { password: hashedPassword, updatedAt: now } }
    );

    if (updateResult.matchedCount === 0) {
      logger.warn("Failed to update password: tenant not found", { tenantId, role, at: now.toISOString() });
      return NextResponse.json({ success: false, message: "Failed to update password" }, { status: 404 });
    }

    logger.info("Password changed successfully", {
      tenantId,
      actorRole: role,
      actorId: userId,
      impersonating: role === "propertyOwner" ? isImpersonating : false,
      at: now.toISOString(),
    });
    return NextResponse.json({ success: true, message: "Password changed successfully" }, { status: 200 });
  } catch (error: unknown) {
    logger.error("POST Change Password Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
      tenantId: body?.tenantId || "MISSING",
      role,
      at: now.toISOString(),
    });
    return NextResponse.json(
      { success: false, message: "Server error while changing password" },
      { status: 500 }
    );
  }
}

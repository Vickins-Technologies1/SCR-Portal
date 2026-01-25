// src/app/api/tenant/change-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "../../../../lib/csrf";
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
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");
  let body: ChangePasswordRequestBody | null = null;

  // Authentication check
  if (!userId || !role || role !== "tenant") {
    logger.error("Unauthorized access attempt", { userId, role, timestamp: "2025-08-07T14:59:00+03:00" });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // CSRF validation
  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId, csrfToken, cookies: request.cookies.getAll(), timestamp: "2025-08-07T14:59:00+03:00" });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    body = await request.json();
    if (!body) {
      logger.error("Invalid request body", { userId, timestamp: "2025-08-07T14:59:00+03:00" });
      return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    }

    const { tenantId, password } = body;

    // Input validation
    if (!tenantId) {
      logger.error("Missing tenantId", { userId, timestamp: "2025-08-07T14:59:00+03:00" });
      return NextResponse.json({ success: false, message: "Missing tenantId" }, { status: 400 });
    }
    if (tenantId !== userId) {
      logger.error("User ID mismatch", { userId, tenantId, timestamp: "2025-08-07T14:59:00+03:00" });
      return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 403 });
    }
    if (!password || password.length < 8) {
      logger.error("Invalid password", { userId, timestamp: "2025-08-07T14:59:00+03:00" });
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();

    // Verify tenant exists
    const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
    if (!tenant) {
      logger.error("Tenant not found", { tenantId, timestamp: "2025-08-07T14:59:00+03:00" });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update tenant's password
    const updateResult = await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      { $set: { password: hashedPassword, updatedAt: new Date("2025-08-07T14:59:00+03:00") } }
    );

    if (updateResult.matchedCount === 0) {
      logger.error("Failed to update password: tenant not found", { tenantId, timestamp: "2025-08-07T14:59:00+03:00" });
      return NextResponse.json({ success: false, message: "Failed to update password" }, { status: 404 });
    }

    logger.debug("Password changed successfully", { tenantId, timestamp: "2025-08-07T14:59:00+03:00" });
    return NextResponse.json({ success: true, message: "Password changed successfully" }, { status: 200 });
  } catch (error: unknown) {
    logger.error("POST Change Password Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
      tenantId: body?.tenantId || "MISSING",
      timestamp: "2025-08-07T14:59:00+03:00"
    });
    return NextResponse.json(
      { success: false, message: "Server error while changing password" },
      { status: 500 }
    );
  }
}
// src/app/api/tenants/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../../../lib/email";
import { sendWelcomeSms } from "../../../lib/sms";
import { sendWhatsAppMessage } from "../../../lib/whatsapp";
import { TenantRequest, ResponseTenant } from "../../../types/tenant";

// Local types (only for this file)
interface UnitType {
  type: string;
  uniqueType?: string;
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  managementFee?: number;
  quantity: number;
}

interface Property {
  _id: ObjectId | string;
  ownerId: string;
  name: string;
  unitTypes: UnitType[];
  rentPaymentDate?: number;
  requiresAdminApproval?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

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
  status: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt?: Date;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
  deliveryMethod?: "sms" | "email" | "whatsapp" | "both" | "app";
}

// Logger
const logger = {
  debug: (msg: string, meta?: any) => process.env.NODE_ENV !== "production" && console.debug(`[DEBUG] ${msg}`, meta || ""),
  info: (msg: string, meta?: any) => console.info(`[INFO] ${msg}`, meta || ""),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ""),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ""),
};

// CSRF Token Validation
const validateCsrfToken = async (request: NextRequest): Promise<boolean> => {
  const csrfToken = request.headers.get("x-csrf-token");
  const cookieToken = (await cookies()).get("csrf-token")?.value;

  logger.debug("CSRF Token Validation", { headerCsrfToken: csrfToken, cookieCsrfToken: cookieToken });

  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    logger.warn("Invalid or missing CSRF token");
    return false;
  }
  return true;
};

// Safe ISO string conversion
const toISO = (date: Date | string | undefined): string | undefined => {
  if (!date) return undefined;
  try {
    return new Date(date).toISOString();
  } catch {
    return undefined;
  }
};

// ==================== GET: List Tenants ====================
export async function GET(request: NextRequest) {
  try {
    const userId = (await cookies()).get("userId")?.value;
    const role = (await cookies()).get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const filters: any = { ownerId: userId };
    if (searchParams.get("name")) filters.name = { $regex: searchParams.get("name")!, $options: "i" };
    if (searchParams.get("email")) filters.email = { $regex: searchParams.get("email")!, $options: "i" };
    if (searchParams.get("propertyId")) filters.propertyId = searchParams.get("propertyId");
    if (searchParams.get("unitType")) filters.unitType = { $regex: searchParams.get("unitType")!, $options: "i" };

    const { db } = await connectToDatabase();
    const total = await db.collection<Tenant>("tenants").countDocuments(filters);
    const tenants = await db.collection<Tenant>("tenants")
      .find(filters)
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      tenants: tenants.map((t): ResponseTenant => ({
        _id: t._id.toString(),
        ownerId: t.ownerId,
        name: t.name,
        email: t.email,
        phone: t.phone,
        role: t.role,
        propertyId: t.propertyId,
        unitType: t.unitType,
        price: t.price,
        deposit: t.deposit,
        houseNumber: t.houseNumber,
        leaseStartDate: t.leaseStartDate,
        leaseEndDate: t.leaseEndDate,
        status: t.status || "active",
        paymentStatus: t.paymentStatus || "current",
        createdAt: toISO(t.createdAt)!,
        updatedAt: toISO(t.updatedAt),
        totalRentPaid: t.totalRentPaid ?? 0,
        totalUtilityPaid: t.totalUtilityPaid ?? 0,
        totalDepositPaid: t.totalDepositPaid ?? 0,
        walletBalance: t.walletBalance ?? 0,
        deliveryMethod: t.deliveryMethod,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error("GET /api/tenants error", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// ==================== POST: Create Tenant ====================
export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrfToken(request))) {
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const userId = (await cookies()).get("userId")?.value;
    const role = (await cookies()).get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body: TenantRequest = await request.json();
    logger.debug("POST /api/tenants", { body });

    // Required fields (role is NOT required — we set it)
    const required = [
      "name", "email", "phone", "password",
      "propertyId", "unitType", "price", "deposit",
      "houseNumber", "leaseStartDate", "leaseEndDate"
    ];

    const missing = required.filter(f => !body[f as keyof TenantRequest]);
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, message: `Missing fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Basic validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email!)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!/^\+?\d{10,15}$/.test(body.phone!)) {
      return NextResponse.json({ success: false, message: "Invalid phone number" }, { status: 400 });
    }
    if (new Date(body.leaseEndDate!) <= new Date(body.leaseStartDate!)) {
      return NextResponse.json({ success: false, message: "End date must be after start date" }, { status: 400 });
    }
    if (!ObjectId.isValid(body.propertyId!)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Validate property ownership
    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(body.propertyId!),
      ownerId: userId,
    });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found or not owned by you" }, { status: 404 });
    }

    if (property.requiresAdminApproval) {
      return NextResponse.json({ success: false, message: "This property requires admin approval" }, { status: 403 });
    }

    // Find unit type by .type
    const unit = property.unitTypes.find(u => u.type === body.unitType);

    if (!unit) {
      return NextResponse.json(
        { success: false, message: `Unit type "${body.unitType}" not found. Available: ${property.unitTypes.map(u => u.type).join(", ")}` },
        { status: 400 }
      );
    }

    if (unit.quantity <= 0) {
      return NextResponse.json({ success: false, message: `No units available for "${unit.type}"` }, { status: 400 });
    }

    if (body.price !== unit.price || body.deposit !== unit.deposit) {
      return NextResponse.json({ success: false, message: "Price/deposit must match selected unit type" }, { status: 400 });
    }

    // Invoice check for >3 tenants
    const tenantCount = await db.collection("tenants").countDocuments({ ownerId: userId });
    if (tenantCount >= 3) {
      const paidInvoice = await db.collection("invoices").findOne({
        userId,
        propertyId: body.propertyId,
        unitType: "All Units",
        status: "completed",
      });
      if (!paidInvoice) {
        return NextResponse.json(
          { success: false, message: `Payment required: Management fee invoice for "${property.name}" must be paid to add more tenants` },
          { status: 402 }
        );
      }
    }

    // Create tenant
    const tenantData: Tenant = {
      _id: new ObjectId(),
      ownerId: userId,
      name: body.name!,
      email: body.email!,
      phone: body.phone!,
      password: await bcrypt.hash(body.password!, 10),
      role: "tenant",
      propertyId: body.propertyId!,
      unitType: unit.type,
      price: unit.price,
      deposit: unit.deposit,
      houseNumber: body.houseNumber!,
      leaseStartDate: body.leaseStartDate!,
      leaseEndDate: body.leaseEndDate!,
      status: "active",
      paymentStatus: "current",
      createdAt: new Date(),
      updatedAt: new Date(),
      totalRentPaid: 0,
      totalUtilityPaid: 0,
      totalDepositPaid: 0,
      walletBalance: 0,
      deliveryMethod: "both",
    };

    const result = await db.collection<Tenant>("tenants").insertOne(tenantData);

    // Send welcome messages
    const loginUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    try {
      await sendWelcomeEmail({
        to: body.email!,
        name: body.name!,
        email: body.email!,
        password: body.password!,
        loginUrl,
        propertyName: property.name,
        houseNumber: body.houseNumber!,
      });
    } catch (e) { logger.error("Welcome email failed", e); }

    try {
      const msg = `Welcome ${body.name}! Login: ${loginUrl.replace(/^https?:\/\//, "")}\nEmail: ${body.email}\nPass: ${body.password}\nUnit: ${property.name} ${body.houseNumber!}`;
      await sendWelcomeSms({ phone: body.phone!, message: msg.slice(0, 160) });
    } catch (e) { logger.error("SMS failed", e); }

    try {
      await sendWhatsAppMessage({
        phone: body.phone!,
        message: `Welcome ${body.name}! You've been added to ${property.name}, Unit ${body.houseNumber!}. Login: ${loginUrl}`,
      });
    } catch (e) { logger.error("WhatsApp failed", e); }

    logger.info("Tenant created successfully", { tenantId: result.insertedId.toString() });

    return NextResponse.json(
      {
        success: true,
        message: "Tenant added successfully",
        tenantId: result.insertedId.toString(),
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error("POST /api/tenants error", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
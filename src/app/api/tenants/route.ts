// src/app/api/tenants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { TenantRequest, ResponseTenant } from "../../../types/tenant";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../../../lib/email";
import { sendWelcomeSms } from "../../../lib/sms";
import { sendWhatsAppMessage } from "../../../lib/whatsapp";

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
  _id: ObjectId;
  ownerId: string;
  name: string;
  unitTypes: UnitType[];
  rentPaymentDate: number;
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
}

interface LogMeta {
  [key: string]: unknown;
}

const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[DEBUG] ${message}`, meta || "");
    }
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${message}`, meta || "");
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || "");
  },
  info: (message: string, meta?: LogMeta) => {
    console.info(`[INFO] ${message}`, meta || "");
  },
};

// CSRF Token Validation
const validateCsrfToken = async (request: NextRequest): Promise<boolean> => {
  const csrfToken = request.headers.get("x-csrf-token");
  const cookieStore = await cookies();
  const cookieCsrfToken = cookieStore.get("csrf-token")?.value;

  logger.debug("CSRF Token Validation", {
    headerCsrfToken: csrfToken,
    cookieCsrfToken,
    path: request.nextUrl.pathname,
  });

  if (!csrfToken || !cookieCsrfToken || csrfToken !== cookieCsrfToken) {
    logger.warn("Invalid or missing CSRF token");
    return false;
  }
  return true;
};

// Helper: Safely convert any date-like value to ISO string
const toISO = (date: Date | string | undefined): string | undefined => {
  if (!date) return undefined;
  try {
    return new Date(date).toISOString();
  } catch {
    return undefined;
  }
};

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;
    const tenantName = searchParams.get("tenantName");
    const tenantEmail = searchParams.get("tenantEmail");
    const propertyId = searchParams.get("propertyId");
    const unitType = searchParams.get("unitType");

    const query: any = { ownerId: userId };
    if (tenantName) query.name = { $regex: tenantName, $options: "i" };
    if (tenantEmail) query.email = { $regex: tenantEmail, $options: "i" };
    if (propertyId) query.propertyId = propertyId;
    if (unitType) query.unitType = { $regex: unitType, $options: "i" };

    const { db } = await connectToDatabase();
    const totalTenants = await db.collection<Tenant>("tenants").countDocuments(query);
    const tenants = await db.collection<Tenant>("tenants")
      .find(query)
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
        paymentStatus: t.paymentStatus || "inactive",
        createdAt: toISO(t.createdAt)!, // Always exists and is a Date
        updatedAt: toISO(t.updatedAt),   // Safely handles Date, string, or missing
        totalRentPaid: t.totalRentPaid ?? 0,
        totalUtilityPaid: t.totalUtilityPaid ?? 0,
        totalDepositPaid: t.totalDepositPaid ?? 0,
        walletBalance: t.walletBalance ?? 0,
      })),
      total: totalTenants,
      page,
      limit,
    });
  } catch (error) {
    logger.error("GET /api/tenants error", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrfToken(request))) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing CSRF token" },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const requestData: TenantRequest = await request.json();
    logger.debug("POST /api/tenants - Request body", { requestData });

    // Required fields
    const required = [
      "name", "email", "phone", "password", "role",
      "propertyId", "unitType", "price", "deposit",
      "houseNumber", "leaseStartDate", "leaseEndDate"
    ];
    for (const field of required) {
      if (!requestData[field as keyof TenantRequest]) {
        return NextResponse.json(
          { success: false, message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Basic validations
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestData.email!)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!/^\+?\d{10,15}$/.test(requestData.phone!)) {
      return NextResponse.json({ success: false, message: "Invalid phone number" }, { status: 400 });
    }
    if (new Date(requestData.leaseEndDate!) <= new Date(requestData.leaseStartDate!)) {
      return NextResponse.json({ success: false, message: "Lease end date must be after start date" }, { status: 400 });
    }
    if (!ObjectId.isValid(requestData.propertyId!)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Validate property ownership
    const [validation] = await db.collection("propertyOwners").aggregate([
      { $match: { _id: new ObjectId(userId) } },
      {
        $lookup: {
          from: "properties",
          let: { userId: "$_id" },
          pipeline: [{
            $match: {
              $expr: {
                $and: [
                  { $eq: [ "$ownerId", userId ] },
                  { $eq: [ "$_id", new ObjectId(requestData.propertyId!) ] }
                ]
              }
            }
          }],
          as: "properties"
        }
      },
      { $unwind: "$properties" },
      { $project: { property: "$properties" } }
    ]).toArray();

    if (!validation) {
      return NextResponse.json(
        { success: false, message: "Property not found or you don't own it" },
        { status: 404 }
      );
    }

    const property = validation.property as Property;

    if (property.requiresAdminApproval) {
      return NextResponse.json(
        { success: false, message: "This property requires admin approval" },
        { status: 403 }
      );
    }

    // Match by `type`
    const unit = property.unitTypes.find(u => u.type === requestData.unitType);

    if (!unit) {
      logger.warn("Unit type not found", {
        requested: requestData.unitType,
        available: property.unitTypes.map(u => u.type),
        propertyName: property.name
      });
      return NextResponse.json(
        {
          success: false,
          message: `Unit type "${requestData.unitType}" not found. Available: ${property.unitTypes.map(u => u.type).join(", ")}`
        },
        { status: 400 }
      );
    }

    if (unit.quantity <= 0) {
      return NextResponse.json(
        { success: false, message: `No available units for "${unit.type}"` },
        { status: 400 }
      );
    }

    if (requestData.price !== unit.price || requestData.deposit !== unit.deposit) {
      return NextResponse.json(
        { success: false, message: "Price/deposit doesn't match selected unit type" },
        { status: 400 }
      );
    }

    // Invoice check for >3 tenants
    const tenantCount = await db.collection("tenants").countDocuments({ ownerId: userId });
    if (tenantCount >= 3) {
      const invoice = await db.collection("invoices").findOne({
        userId,
        propertyId: requestData.propertyId,
        unitType: "All Units",
        status: "completed"
      });
      if (!invoice) {
        return NextResponse.json(
          { success: false, message: `Pay the management fee invoice for "${property.name}" to add more tenants` },
          { status: 402 }
        );
      }
    }

    // Create tenant
    const tenantData: Tenant = {
      _id: new ObjectId(),
      ownerId: userId,
      name: requestData.name!,
      email: requestData.email!,
      phone: requestData.phone!,
      password: await bcrypt.hash(requestData.password!, 10),
      role: requestData.role!,
      propertyId: requestData.propertyId!,
      unitType: requestData.unitType!,
      price: requestData.price!,
      deposit: requestData.deposit!,
      houseNumber: requestData.houseNumber!,
      leaseStartDate: requestData.leaseStartDate!,
      leaseEndDate: requestData.leaseEndDate!,
      status: "active",
      paymentStatus: "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
      totalRentPaid: 0,
      totalUtilityPaid: 0,
      totalDepositPaid: 0,
      walletBalance: 0,
    };

    const result = await db.collection("tenants").insertOne(tenantData);

    // Send welcome communications
    try {
      await sendWelcomeEmail({
        to: requestData.email!,
        name: requestData.name!,
        email: requestData.email!,
        password: requestData.password!,
        loginUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
        propertyName: property.name,
        houseNumber: requestData.houseNumber!,
      });
    } catch (e) { logger.error("Welcome email failed", { error: e }); }

    try {
      const shortUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.scrm.co.ke").replace(/^https?:\/\//, "");
      const message = `Hi ${requestData.name}! Login: ${shortUrl}\nEmail: ${requestData.email}\nPass: ${requestData.password}\nUnit: ${property.name} ${requestData.houseNumber}`;
      await sendWelcomeSms({ phone: requestData.phone!, message: message.slice(0, 160) });
    } catch (e) { logger.error("SMS failed", { error: e }); }

    try {
      await sendWhatsAppMessage({
        phone: requestData.phone!,
        message: `Welcome ${requestData.name}! You've been added to ${property.name}, Unit ${requestData.houseNumber}. Login at ${process.env.NEXT_PUBLIC_BASE_URL} with email: ${requestData.email}`
      });
    } catch (e) { logger.error("WhatsApp failed", { error: e }); }

    logger.info("Tenant created successfully", { tenantId: result.insertedId });

    return NextResponse.json(
      {
        success: true,
        message: "Tenant added successfully",
        tenantId: result.insertedId.toString(),
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    logger.error("POST /api/tenants error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
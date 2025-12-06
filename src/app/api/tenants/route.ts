// src/app/api/tenants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../../../lib/email";
import { sendWelcomeSms } from "../../../lib/sms";
import { sendWhatsAppMessage } from "../../../lib/whatsapp";
import { TenantRequest, ResponseTenant, Tenant } from "../../../types/tenant";
import { Property } from "../../../types/property";

const logger = {
  debug: (msg: string, meta?: any) => process.env.NODE_ENV !== "production" && console.debug(`[DEBUG] ${msg}`, meta || ""),
  info: (msg: string, meta?: any) => console.info(`[INFO] ${msg}`, meta || ""),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ""),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ""),
};

const validateCsrfToken = async (request: NextRequest): Promise<boolean> => {
  const csrfToken = request.headers.get("x-csrf-token");
  const cookieToken = (await cookies()).get("csrf-token")?.value;
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    logger.warn("Invalid CSRF token");
    return false;
  }
  return true;
};

const toISO = (date?: Date | string): string | undefined => date ? new Date(date).toISOString() : undefined;

// GET: List Tenants (with pagination & filters)
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
        unitIdentifier: t.unitIdentifier,
        price: t.price,
        deposit: t.deposit,
        houseNumber: t.houseNumber,
        leaseStartDate: t.leaseStartDate,
        leaseEndDate: t.leaseEndDate,
        status: t.status,
        paymentStatus: t.paymentStatus,
        createdAt: toISO(t.createdAt)!,
        updatedAt: toISO(t.updatedAt),
        totalRentPaid: t.totalRentPaid,
        totalUtilityPaid: t.totalUtilityPaid,
        totalDepositPaid: t.totalDepositPaid,
        walletBalance: t.walletBalance,
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

// POST: Create New Tenant — FIXED FOR BOTH OLD & NEW PROPERTIES
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

    // Required fields
    const required = ["name", "email", "phone", "password", "propertyId", "unitIdentifier", "houseNumber", "leaseStartDate", "leaseEndDate"];
    const missing = required.filter(f => !body[f as keyof TenantRequest]);
    if (missing.length > 0) {
      return NextResponse.json({ success: false, message: `Missing fields: ${missing.join(", ")}` }, { status: 400 });
    }

    // Basic validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!/^\+?\d{10,15}$/.test(body.phone)) {
      return NextResponse.json({ success: false, message: "Invalid phone number" }, { status: 400 });
    }
    if (new Date(body.leaseEndDate) <= new Date(body.leaseStartDate)) {
      return NextResponse.json({ success: false, message: "Lease end date must be after start date" }, { status: 400 });
    }
    if (!ObjectId.isValid(body.propertyId)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Validate property ownership
    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(body.propertyId),
      ownerId: userId,
    });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found or not owned by you" }, { status: 404 });
    }

    // CRITICAL FIX: Handle properties with and without uniqueType
    const unitConfigWithUnique = property.unitTypes
      .map((unit, index) => ({
        ...unit,
        uniqueType: unit.uniqueType || `${unit.type}-${index}`, // fallback for old data
      }))
      .find(u => u.uniqueType === body.unitIdentifier);

    if (!unitConfigWithUnique) {
      return NextResponse.json({ success: false, message: "Invalid unit type selected" }, { status: 400 });
    }

    if (unitConfigWithUnique.quantity <= 0) {
      return NextResponse.json({
        success: false,
        message: `No available units for ${unitConfigWithUnique.type} (Ksh ${unitConfigWithUnique.price}/mo)`,
      }, { status: 400 });
    }

    // Check management fee (same as before)
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
          { success: false, message: "Payment required: Management fee invoice must be paid to add more tenants" },
          { status: 402 }
        );
      }
    }

    // Create tenant
    const tenantData: Tenant = {
      _id: new ObjectId(),
      ownerId: userId,
      name: body.name.trim(),
      email: body.email.trim(),
      phone: body.phone.trim(),
      password: await bcrypt.hash(body.password!, 10),
      role: "tenant",
      propertyId: body.propertyId,
      unitType: unitConfigWithUnique.type,
      unitIdentifier: unitConfigWithUnique.uniqueType,
      price: unitConfigWithUnique.price,
      deposit: unitConfigWithUnique.deposit,
      houseNumber: body.houseNumber.trim(),
      leaseStartDate: body.leaseStartDate,
      leaseEndDate: body.leaseEndDate,
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

    // Decrement quantity using the real uniqueType (now guaranteed to exist)
    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(body.propertyId) },
      { $inc: { "unitTypes.$[elem].quantity": -1 } },
      { arrayFilters: [{ "elem.uniqueType": unitConfigWithUnique.uniqueType }] }
    );

    // Send welcome messages
    const loginUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    try { await sendWelcomeEmail({ to: body.email, name: body.name, email: body.email, password: body.password!, loginUrl, propertyName: property.name, houseNumber: body.houseNumber }); } catch (e) { logger.error("Email failed", e); }
    try { await sendWelcomeSms({ phone: body.phone, message: `Welcome ${body.name}! Login: ${loginUrl}\nUnit: ${property.name} ${body.houseNumber}` }); } catch (e) { logger.error("SMS failed", e); }
    try { await sendWhatsAppMessage({ phone: body.phone, message: `Welcome ${body.name}! You've been added to ${property.name}, Unit ${body.houseNumber}. Login: ${loginUrl}` }); } catch (e) { logger.error("WhatsApp failed", e); }

    logger.info("Tenant created successfully", { tenantId: result.insertedId.toString(), unitIdentifier: body.unitIdentifier });

    return NextResponse.json({
      success: true,
      message: "Tenant added successfully",
      tenantId: result.insertedId.toString(),
    }, { status: 201 });

  } catch (error: any) {
    logger.error("POST /api/tenants error", { error: error.message, stack: error.stack });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
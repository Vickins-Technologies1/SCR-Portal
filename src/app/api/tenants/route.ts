import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { TenantRequest, UnitType } from "../../../types/tenant";
import { sendWelcomeEmail } from "../../../lib/email";
export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone);
}

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  ownerId: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  tenants?: T[];
  tenant?: T;
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<Tenant>>> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const tenants = await db.collection<Tenant>("tenants").find({ ownerId: userId }).toArray();

    const formattedTenants: Tenant[] = tenants.map((tenant) => ({
      _id: tenant._id.toString(),
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      password: tenant.password,
      role: tenant.role,
      ownerId: tenant.ownerId,
      propertyId: tenant.propertyId.toString(),
      unitType: tenant.unitType,
      price: tenant.price,
      deposit: tenant.deposit,
      houseNumber: tenant.houseNumber,
      status: tenant.status,
      paymentStatus: tenant.paymentStatus || "current", // Default to "current" if missing
      createdAt: tenant.createdAt,
    }));

    return NextResponse.json({ success: true, tenants: formattedTenants });
  } catch (error) {
    console.error("Error in GET /api/tenants:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Tenant>>> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body: TenantRequest = await req.json();
    const {
      name,
      email,
      phone,
      password,
      role: tenantRole,
      propertyId,
      unitType,
      price,
      deposit,
      houseNumber,
    } = body;

    // Validate required fields
    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      !tenantRole ||
      !propertyId ||
      !unitType ||
      !houseNumber ||
      price === undefined ||
      deposit === undefined
    ) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    if (tenantRole !== "tenant") {
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    if (!isValidPhone(phone)) {
      return NextResponse.json({ success: false, message: "Invalid phone format" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Check duplicate email
    const existing = await db.collection("tenants").findOne({ email });
    if (existing) {
      return NextResponse.json({ success: false, message: "Email already exists" }, { status: 400 });
    }

    // Validate property ownership
    const property = await db.collection("properties").findOne({
      _id: new ObjectId(propertyId),
      ownerId: userId,
    });
    if (!property) {
      return NextResponse.json({ success: false, message: "Invalid property" }, { status: 400 });
    }

    // Validate unitType
    const unit = property.unitTypes.find((u: UnitType) => u.type === unitType);
    if (!unit || unit.price !== price || unit.deposit !== deposit) {
      return NextResponse.json({ success: false, message: "Invalid unit or price/deposit mismatch" }, { status: 400 });
    }

    // Check if house number already exists
    const existingHouseNumber = await db.collection("tenants").findOne({
      propertyId: new ObjectId(propertyId),
      houseNumber,
    });
    if (existingHouseNumber) {
      return NextResponse.json({ success: false, message: "House number already in use for this property" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const tenant: Tenant = {
      _id: new ObjectId().toString(),
      name,
      email,
      phone,
      password: hashedPassword,
      role: "tenant",
      ownerId: userId,
      propertyId,
      unitType,
      price: parseFloat(price.toString()),
      deposit: parseFloat(deposit.toString()),
      houseNumber,
      status: "active",
      paymentStatus: "current",
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection("tenants").insertOne({
      ...tenant,
      _id: new ObjectId(tenant._id),
      propertyId: new ObjectId(propertyId),
    });

    // Generate login URL
    const loginUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    // Send welcome email
    await sendWelcomeEmail({
      to: email,
      name,
      email,
      loginUrl,
      propertyId,
      houseNumber,
    });

    return NextResponse.json(
      {
        success: true,
        tenant: {
          ...tenant,
          _id: result.insertedId.toString(),
          propertyId: propertyId.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/tenants:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
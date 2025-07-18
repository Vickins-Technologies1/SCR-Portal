// src/app/api/tenants/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { TenantRequest, UnitType } from "../../../types/tenant";
import { sendWelcomeEmail } from "../../../lib/email";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string) {
  return /^\+?\d{10,15}$/.test(phone);
}

export async function GET(request: Request) {
  const cookies = request.headers.get("cookie");
  const userId = cookies?.match(/userId=([^;]+)/)?.[1];
  const role = cookies?.match(/role=([^;]+)/)?.[1];

  if (!userId || role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { db } = await connectToDatabase();
  const tenants = await db.collection("tenants").find({ ownerId: userId }).toArray();
  return NextResponse.json({ success: true, tenants });
}

export async function POST(request: Request) {
  try {
    const cookies = request.headers.get("cookie");
    const userId = cookies?.match(/userId=([^;]+)/)?.[1];
    const role = cookies?.match(/role=([^;]+)/)?.[1];

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body: TenantRequest = await request.json();
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
      !name || !email || !phone || !password || !tenantRole ||
      !propertyId || !unitType || !houseNumber ||
      price === undefined || deposit === undefined
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
      propertyId,
      houseNumber,
    });
    if (existingHouseNumber) {
      return NextResponse.json({ success: false, message: "House number already in use for this property" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const tenant = {
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
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection("tenants").insertOne(tenant);

    // Send welcome email
    await sendWelcomeEmail(email, name, email, password, propertyId, houseNumber);

    return NextResponse.json(
      { success: true, tenant: { ...tenant, _id: result.insertedId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/tenants:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}



// src/pages/api/tenants.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb"; // Import ObjectId

interface TenantRequest {
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
}

interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

export async function GET(request: Request) {
  try {
    console.log("Handling GET request to /api/tenants");
    const cookies = request.headers.get("cookie");
    const userId = new URL(request.url).searchParams.get("userId");

    if (!cookies?.includes("userId") || !cookies?.includes("role=propertyOwner")) {
      console.log("Tenants API: Unauthorized GET");
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    if (!userId) {
      console.log("Tenants API: Missing userId");
      return NextResponse.json({ success: false, message: "User ID is required" }, { status: 400 });
    }

    // Validate userId as ObjectId
    if (!ObjectId.isValid(userId)) {
      console.log("Invalid userId format:", userId);
      return NextResponse.json({ success: false, message: "Invalid user ID format" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const tenants = await db.collection("tenants").find({ ownerId: userId }).toArray();
    console.log(`Tenants fetched for userId ${userId}:`, tenants);
    return NextResponse.json({ success: true, tenants }, { status: 200 });
  } catch (error) {
    console.error("Error fetching tenants:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes("Database configuration error")) {
      return NextResponse.json(
        { success: false, message: "Database configuration error" },
        { status: 500 }
      );
    }
    if (error instanceof Error && error.message.includes("Failed to connect to the database")) {
      return NextResponse.json(
        { success: false, message: "Unable to connect to the database" },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    console.log("Handling POST request to /api/tenants");
    const cookies = request.headers.get("cookie");
    if (!cookies?.includes("userId") || !cookies?.includes("role=propertyOwner")) {
      console.log("Tenants API: Unauthorized POST");
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    console.log("Received tenant data:", body);
    const {
      name,
      email,
      phone,
      password,
      role,
      ownerId,
      propertyId,
      unitType,
      price,
      deposit,
      houseNumber,
    }: TenantRequest = body;

    // Input validation
    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      role !== "tenant" ||
      !ownerId ||
      !propertyId ||
      !unitType ||
      price === undefined ||
      deposit === undefined ||
      !houseNumber
    ) {
      console.log("Missing required fields:", body);
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("Invalid email format:", email);
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    // Validate phone format (basic example, adjust as needed)
    const phoneRegex = /^\+?\d{10,15}$/;
    if (!phoneRegex.test(phone)) {
      console.log("Invalid phone format:", phone);
      return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
    }

    // Validate ObjectId formats
    if (!ObjectId.isValid(ownerId) || !ObjectId.isValid(propertyId)) {
      console.log("Invalid ObjectId format:", { ownerId, propertyId });
      return NextResponse.json({ success: false, message: "Invalid owner or property ID format" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Check for email uniqueness
    const existingTenant = await db.collection("tenants").findOne({ email });
    if (existingTenant) {
      console.log("Email already exists:", email);
      return NextResponse.json({ success: false, message: "Email already exists" }, { status: 400 });
    }

    // Validate propertyId exists and belongs to ownerId
    const property = await db.collection("properties").findOne({
      _id: new ObjectId(propertyId), // Convert to ObjectId
      ownerId,
    });
    if (!property) {
      console.log("Invalid property or ownership:", { propertyId, ownerId });
      return NextResponse.json(
        { success: false, message: "Invalid property ID or property does not belong to user" },
        { status: 400 }
      );
    }

    // Validate unitType exists in the property and check price/deposit
    const unit = property.unitTypes.find((u: UnitType) => u.type === unitType);
    if (!unit) {
      console.log("Invalid unit type:", unitType);
      return NextResponse.json(
        { success: false, message: "Invalid unit type for selected property" },
        { status: 400 }
      );
    }
    if (price < 0 || deposit < 0) {
      console.log("Invalid price or deposit:", { price, deposit });
      return NextResponse.json(
        { success: false, message: "Price and deposit must be non-negative" },
        { status: 400 }
      );
    }
    if (price !== unit.price || deposit !== unit.deposit) {
      console.log("Price/deposit mismatch:", { price, deposit, unitPrice: unit.price, unitDeposit: unit.deposit });
      return NextResponse.json(
        { success: false, message: "Price and deposit must match the unit type's values" },
        { status: 400 }
      );
    }

    // Validate houseNumber uniqueness within the property
    const existingHouseNumber = await db.collection("tenants").findOne({
      propertyId,
      houseNumber,
    });
    if (existingHouseNumber) {
      console.log("House number already in use:", houseNumber);
      return NextResponse.json(
        { success: false, message: "House number already in use for this property" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newTenant = {
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      ownerId,
      propertyId,
      unitType,
      price: parseFloat(price.toString()),
      deposit: parseFloat(deposit.toString()),
      houseNumber,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection("tenants").insertOne(newTenant);

    // TODO: Implement actual email service (e.g., Nodemailer, SendGrid)
    console.log(`Simulating email to ${email}: Tenant account created. Please log in with your email and password.`);

    return NextResponse.json(
      { success: true, tenant: { ...newTenant, _id: result.insertedId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating tenant:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: await request.json().catch(() => "Failed to parse request body"),
    });
    if (error instanceof Error && error.message.includes("Database configuration error")) {
      return NextResponse.json(
        { success: false, message: "Database configuration error" },
        { status: 500 }
      );
    }
    if (error instanceof Error && error.message.includes("Failed to connect to the database")) {
      return NextResponse.json(
        { success: false, message: "Unable to connect to the database" },
        { status: 503 }
      );
    }
    if (error instanceof Error && error.message.includes("Invalid ObjectId")) {
      return NextResponse.json(
        { success: false, message: "Invalid owner or property ID format" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
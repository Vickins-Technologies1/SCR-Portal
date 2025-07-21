import { NextResponse, NextRequest } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { TenantRequest } from "../../../types/tenant";
import { sendWelcomeEmail } from "../../../lib/email";
export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone);
}

// Database connection
const connectToDatabase = async (): Promise<{ db: Db; client: MongoClient }> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  try {
    await client.connect();
    const db = client.db("rentaldb");
    console.log("Connected to MongoDB database:", db.databaseName);
    return { db, client };
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw new Error("Database connection failed");
  }
};

interface UnitType {
  type: string;
  price: number;
  deposit: number;
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
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  tenants?: T[];
  tenant?: T;
}

export async function GET(): Promise<NextResponse<ApiResponse<Tenant>>> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db, client } = await connectToDatabase();
    try {
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
        leaseStartDate: tenant.leaseStartDate || "",
        leaseEndDate: tenant.leaseEndDate || "",
        status: tenant.status,
        paymentStatus: tenant.paymentStatus || "current",
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        walletBalance: tenant.walletBalance || 0,
      }));

      return NextResponse.json({ success: true, tenants: formattedTenants });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error in GET /api/tenants:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Tenant>>> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
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
      leaseStartDate,
      leaseEndDate,
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
      !leaseStartDate ||
      !leaseEndDate ||
      price === undefined ||
      deposit === undefined
    ) {
      console.log("Missing required fields:", body);
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    if (tenantRole !== "tenant") {
      console.log("Invalid role:", tenantRole);
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      console.log("Invalid email format:", email);
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    if (!isValidPhone(phone)) {
      console.log("Invalid phone format:", phone);
      return NextResponse.json({ success: false, message: "Invalid phone format" }, { status: 400 });
    }

    if (new Date(leaseEndDate) <= new Date(leaseStartDate)) {
      console.log("Invalid lease dates:", leaseStartDate, leaseEndDate);
      return NextResponse.json({ success: false, message: "Lease end date must be after start date" }, { status: 400 });
    }

    const { db, client } = await connectToDatabase();

    try {
      // Check duplicate email
      const existing = await db.collection("tenants").findOne({ email });
      if (existing) {
        console.log("Email already exists:", email);
        return NextResponse.json({ success: false, message: "Email already exists" }, { status: 400 });
      }

      // Validate property ownership
      const property = await db.collection("properties").findOne({
        _id: new ObjectId(propertyId),
        ownerId: userId,
      });
      if (!property) {
        console.log("Invalid property ID:", propertyId);
        return NextResponse.json({ success: false, message: "Invalid property" }, { status: 400 });
      }

      // Validate unitType
      const unit = property.unitTypes.find((u: UnitType) => u.type === unitType);
      if (!unit || unit.price !== price || unit.deposit !== deposit) {
        console.log("Invalid unit or price/deposit mismatch:", unitType);
        return NextResponse.json({ success: false, message: "Invalid unit or price/deposit mismatch" }, { status: 400 });
      }

      // Check if house number already exists
      const existingHouseNumber = await db.collection("tenants").findOne({
        propertyId: new ObjectId(propertyId),
        houseNumber,
      });
      if (existingHouseNumber) {
        console.log("House number already in use:", houseNumber);
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
        leaseStartDate,
        leaseEndDate,
        status: "active",
        paymentStatus: "current",
        createdAt: new Date().toISOString(),
        walletBalance: 0,
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

      // Send welcome email with password
      await sendWelcomeEmail({
        to: email,
        name,
        email,
        password,
        loginUrl,
        propertyName: property.name,
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
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error in POST /api/tenants:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}
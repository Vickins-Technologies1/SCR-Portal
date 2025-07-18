// src/app/api/tenants/[tenantId]/route.ts
import { NextResponse, NextRequest } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { cookies } from "next/headers";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  try {
    await client.connect();
    const db = client.db("rentaldb");
    console.log("Connected to MongoDB database:", db.databaseName);
    return db;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
};

// Types
interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

interface TenantRequest {
  name: string;
  email: string;
  password?: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  status?: string;
  paymentStatus?: string;
  ownerId?: string;
  updatedAt?: string;
}

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  password?: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  status: string;
  paymentStatus: string;
  ownerId: string;
  updatedAt: string;
}

interface Property {
  _id: ObjectId;
  name: string;
  ownerId: string;
  unitTypes: UnitType[];
}

const sendUpdateEmail = async (email: string, name: string): Promise<void> => {
  console.log(`Sending update email to ${email} for tenant ${name}`);
};

// GET Handler
export async function GET(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const params = await context.params; // Await params to resolve Promise
    const { tenantId } = params;
    console.log("GET /api/tenants/[tenantId] - Tenant ID:", tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log("Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const cookieStore = await cookies(); // Await cookies to resolve Promise
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || (role !== "tenant" && role !== "propertyOwner")) {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();
    let tenant;

    if (role === "tenant" && userId === tenantId) {
      // Tenant accessing their own data
      tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
      });
    } else if (role === "propertyOwner") {
      // Property owner accessing tenant under their property
      tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
        ownerId: userId,
      });
    }

    console.log("Tenant query result:", tenant);

    if (!tenant) {
      console.log("Tenant not found or not authorized for ID:", tenantId);
      return NextResponse.json({ success: false, message: "Tenant not found or not authorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true, tenant });
  } catch (error) {
    console.error("Error in GET /api/tenants/[tenantId]:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// PUT Handler
export async function PUT(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const params = await context.params; // Await params
    const { tenantId } = params;
    console.log("PUT /api/tenants/[tenantId] - Tenant ID:", tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log("Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const cookieStore = await cookies(); // Await cookies to resolve Promise
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body: TenantRequest = await req.json();
    const db = await connectToDatabase();

    const existingTenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId), ownerId: userId });

    if (!existingTenant) {
      console.log("Tenant not found for ID:", tenantId);
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const property = await db
      .collection<Property>("properties")
      .findOne({ _id: new ObjectId(body.propertyId), ownerId: userId });

    if (!property) {
      console.log("Invalid property ID:", body.propertyId);
      return NextResponse.json({ success: false, message: "Invalid property" }, { status: 400 });
    }

    const unit = property.unitTypes.find((u) => u.type === body.unitType);
    if (!unit || unit.price !== body.price || unit.deposit !== body.deposit) {
      console.log("Invalid unit or price/deposit mismatch:", body.unitType);
      return NextResponse.json({ success: false, message: "Invalid unit or price/deposit mismatch" }, { status: 400 });
    }

    const updateData: Partial<Tenant> = {
      name: body.name,
      email: body.email,
      propertyId: body.propertyId,
      houseNumber: body.houseNumber,
      unitType: body.unitType,
      price: body.price,
      deposit: body.deposit,
      status: body.status ?? existingTenant.status,
      paymentStatus: body.paymentStatus ?? existingTenant.paymentStatus,
      ownerId: userId,
      updatedAt: new Date().toISOString(),
    };

    if (body.password) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      { $set: updateData }
    );

    await sendUpdateEmail(body.email, body.name);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating tenant:", error);
    return NextResponse.json({ success: false, message: "Failed to update tenant" }, { status: 500 });
  }
}

// DELETE Handler
export async function DELETE(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const params = await context.params; // Await params
    const { tenantId } = params;
    console.log("DELETE /api/tenants/[tenantId] - Tenant ID:", tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log("Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const cookieStore = await cookies(); // Await cookies to resolve Promise
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();
    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId), ownerId: userId });

    if (!tenant) {
      console.log("Tenant not found or not authorized for ID:", tenantId);
      return NextResponse.json({ success: false, message: "Not authorized or tenant not found" }, { status: 403 });
    }

    await db.collection<Tenant>("tenants").deleteOne({ _id: new ObjectId(tenantId) });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tenant:", error);
    return NextResponse.json({ success: false, message: "Failed to delete tenant" }, { status: 500 });
  }
}

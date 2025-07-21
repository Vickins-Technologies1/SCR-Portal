import { NextResponse, NextRequest } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { sendUpdateEmail } from "../../../../lib/email";

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
  phone: string;
  password?: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  status?: string;
  paymentStatus?: string;
  ownerId?: string;
  walletBalance?: number;
}

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  password?: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
}

interface Property {
  _id: ObjectId;
  name: string;
  ownerId: string;
  unitTypes: UnitType[];
}

// GET Handler
export async function GET(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const params = await context.params;
    const { tenantId } = params;
    console.log("GET /api/tenants/[tenantId] - Tenant ID:", tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log("Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || (role !== "tenant" && role !== "propertyOwner")) {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db, client } = await connectToDatabase();
    let tenant;

    try {
      if (role === "tenant" && userId === tenantId) {
        tenant = await db.collection<Tenant>("tenants").findOne({
          _id: new ObjectId(tenantId),
        });
      } else if (role === "propertyOwner") {
        tenant = await db.collection<Tenant>("tenants").findOne({
          _id: new ObjectId(tenantId),
          ownerId: userId,
        });
      }

      if (!tenant) {
        console.log("Tenant not found or not authorized for ID:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found or not authorized" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        tenant: {
          ...tenant,
          _id: tenant._id.toString(),
          propertyId: tenant.propertyId.toString(),
          createdAt: tenant.createdAt,
          leaseStartDate: tenant.leaseStartDate || "",
          leaseEndDate: tenant.leaseEndDate || "",
          walletBalance: tenant.walletBalance || 0,
        },
      });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error in GET /api/tenants/[tenantId]:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}

// PUT Handler
export async function PUT(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const params = await context.params;
    const { tenantId } = params;
    console.log("PUT /api/tenants/[tenantId] - Tenant ID:", tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log("Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body: TenantRequest = await req.json();
    const { db, client } = await connectToDatabase();

    try {
      // Validate required fields
      if (
        !body.name ||
        !body.email ||
        !body.phone ||
        !body.propertyId ||
        !body.houseNumber ||
        !body.unitType ||
        !body.leaseStartDate ||
        !body.leaseEndDate ||
        body.price === undefined ||
        body.deposit === undefined
      ) {
        console.log("Missing required fields:", body);
        return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        console.log("Invalid email format:", body.email);
        return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
      }

      // Validate phone format
      if (!/^\+?\d{10,15}$/.test(body.phone)) {
        console.log("Invalid phone format:", body.phone);
        return NextResponse.json({ success: false, message: "Invalid phone format" }, { status: 400 });
      }

      // Validate lease dates
      if (new Date(body.leaseEndDate) <= new Date(body.leaseStartDate)) {
        console.log("Invalid lease dates:", body.leaseStartDate, body.leaseEndDate);
        return NextResponse.json({ success: false, message: "Lease end date must be after start date" }, { status: 400 });
      }

      // Validate walletBalance if provided
      if (body.walletBalance !== undefined && (typeof body.walletBalance !== "number" || body.walletBalance < 0)) {
        console.log("Invalid wallet balance:", body.walletBalance);
        return NextResponse.json({ success: false, message: "Wallet balance must be a non-negative number" }, { status: 400 });
      }

      // Check if tenant exists and belongs to the owner
      const existingTenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
        ownerId: userId,
      });

      if (!existingTenant) {
        console.log("Tenant not found for ID:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found or not authorized" }, { status: 404 });
      }

      // Check for email uniqueness (excluding current tenant)
      const emailExists = await db.collection<Tenant>("tenants").findOne({
        email: body.email,
        _id: { $ne: new ObjectId(tenantId) },
      });
      if (emailExists) {
        console.log("Email already exists:", body.email);
        return NextResponse.json({ success: false, message: "Email already exists" }, { status: 400 });
      }

      // Validate property ownership
      const property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(body.propertyId),
        ownerId: userId,
      });
      if (!property) {
        console.log("Invalid property ID:", body.propertyId);
        return NextResponse.json({ success: false, message: "Invalid property" }, { status: 400 });
      }

      // Validate unit type and price/deposit
      const unit = property.unitTypes.find((u) => u.type === body.unitType);
      if (!unit || unit.price !== body.price || unit.deposit !== body.deposit) {
        console.log("Invalid unit or price/deposit mismatch:", body.unitType);
        return NextResponse.json({ success: false, message: "Invalid unit or price/deposit mismatch" }, { status: 400 });
      }

      // Check for house number uniqueness (excluding current tenant)
      const houseNumberExists = await db.collection<Tenant>("tenants").findOne({
        propertyId: body.propertyId,
        houseNumber: body.houseNumber,
        _id: { $ne: new ObjectId(tenantId) },
      });
      if (houseNumberExists) {
        console.log("House number already in use:", body.houseNumber);
        return NextResponse.json({ success: false, message: "House number already in use for this property" }, { status: 400 });
      }

      // Prepare update data
      const updateData: Partial<Tenant> = {
        name: body.name,
        email: body.email,
        phone: body.phone,
        propertyId: body.propertyId,
        houseNumber: body.houseNumber,
        unitType: body.unitType,
        price: body.price,
        deposit: body.deposit,
        leaseStartDate: body.leaseStartDate,
        leaseEndDate: body.leaseEndDate,
        status: body.status ?? existingTenant.status,
        paymentStatus: body.paymentStatus ?? existingTenant.paymentStatus,
        ownerId: userId,
        createdAt: existingTenant.createdAt,
        updatedAt: new Date().toISOString(),
        walletBalance: body.walletBalance !== undefined ? body.walletBalance : existingTenant.walletBalance,
      };

      if (body.password) {
        updateData.password = await bcrypt.hash(body.password, 10);
      }

      // Log wallet balance change if applicable
      if (body.walletBalance !== undefined && body.walletBalance !== existingTenant.walletBalance) {
        console.log(`Wallet balance updated for tenant ${tenantId}: ${existingTenant.walletBalance} -> ${body.walletBalance}`);
        await db.collection("walletTransactions").insertOne({
          tenantId,
          type: body.walletBalance > existingTenant.walletBalance ? "credit" : "debit",
          amount: Math.abs(body.walletBalance - existingTenant.walletBalance),
          createdAt: new Date().toISOString(),
          description: `Wallet balance updated via tenant update`,
        });
      }

      // Update tenant
      const result = await db.collection<Tenant>("tenants").updateOne(
        { _id: new ObjectId(tenantId) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        console.log("No tenant matched for update:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }

      // Send update email
      await sendUpdateEmail({
        to: body.email,
        name: body.name,
        email: body.email,
        propertyName: property.name,
        houseNumber: body.houseNumber,
      });

      return NextResponse.json({
        success: true,
        tenant: {
          ...updateData,
          _id: tenantId,
          propertyId: body.propertyId,
          walletBalance: updateData.walletBalance || 0,
        },
      });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error in PUT /api/tenants/[tenantId]:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}

// DELETE Handler
export async function DELETE(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const params = await context.params;
    const { tenantId } = params;
    console.log("DELETE /api/tenants/[tenantId] - Tenant ID:", tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log("Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db, client } = await connectToDatabase();

    try {
      // Check if tenant exists and belongs to the owner
      const tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
        ownerId: userId,
      });

      if (!tenant) {
        console.log("Tenant not found or not authorized for ID:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found or not authorized" }, { status: 404 });
      }

      // Delete tenant
      const result = await db.collection<Tenant>("tenants").deleteOne({
        _id: new ObjectId(tenantId),
        ownerId: userId,
      });

      if (result.deletedCount === 0) {
        console.log("No tenant deleted for ID:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found or not authorized" }, { status: 404 });
      }

      // Delete related wallet transactions
      const walletDeleteResult = await db.collection("walletTransactions").deleteMany({
        tenantId,
      });
      console.log(`Deleted ${walletDeleteResult.deletedCount} wallet transactions for tenant ${tenantId}`);

      return NextResponse.json({ success: true, message: "Tenant and related wallet transactions deleted successfully" });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error in DELETE /api/tenants/[tenantId]:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}
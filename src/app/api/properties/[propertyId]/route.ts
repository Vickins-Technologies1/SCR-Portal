import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import { cookies } from "next/headers";

// DB Connection
const connectToDatabase = async () => {
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

// Interfaces
interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

interface Property {
  _id: ObjectId;
  name: string;
  address: string;
  ownerId: string;
  unitTypes: UnitType[];
  status: string;
  createdAt: string;
  updatedAt?: string;
}

interface Tenant {
  _id: ObjectId;
  propertyId: ObjectId | string;
  name: string;
  email: string;
  phone: string;
  price: number;
  status: string;
  paymentStatus: string;
  leaseStartDate: string;
  walletBalance: number;
}

// GET /api/properties/[propertyId]
export async function GET(request: NextRequest, context: { params: Promise<{ propertyId: string }> }) {
  try {
    const { propertyId } = await context.params;
    console.log("GET /api/properties/[propertyId] - Property ID:", propertyId);

    if (!ObjectId.isValid(propertyId)) {
      console.log("Invalid property ID:", propertyId);
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
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
    try {
      let property: Property | null = null;

      if (role === "tenant") {
        const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(userId) });
        if (!tenant || !tenant.propertyId || tenant.propertyId.toString() !== propertyId) {
          console.log("Tenant not associated with property:", propertyId);
          return NextResponse.json({ success: false, message: "Tenant not associated with this property" }, { status: 403 });
        }

        property = await db.collection<Property>("properties").findOne({
          _id: new ObjectId(propertyId),
        });
      } else if (role === "propertyOwner") {
        property = await db.collection<Property>("properties").findOne({
          _id: new ObjectId(propertyId),
          ownerId: userId,
        });
      }

      if (!property) {
        console.log("Property not found or access denied:", propertyId);
        return NextResponse.json({ success: false, message: "Property not found or access denied" }, { status: 404 });
      }

      // For property owners, include associated tenants with walletBalance
      let tenants: Tenant[] = [];
      if (role === "propertyOwner") {
        tenants = await db.collection<Tenant>("tenants").find({ propertyId }).toArray();
      }

      return NextResponse.json({
        success: true,
        property: {
          ...property,
          _id: property._id.toString(),
          ownerId: property.ownerId,
          createdAt: property.createdAt,
        },
        tenants: tenants.map((tenant) => ({
          ...tenant,
          _id: tenant._id.toString(),
          propertyId: tenant.propertyId.toString(),
          walletBalance: tenant.walletBalance || 0,
        })),
      });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("GET error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}

// PUT /api/properties/[propertyId]
export async function PUT(request: NextRequest, context: { params: Promise<{ propertyId: string }> }) {
  try {
    const { propertyId } = await context.params;
    console.log("PUT /api/properties/[propertyId] - Property ID:", propertyId);

    if (!ObjectId.isValid(propertyId)) {
      console.log("Invalid property ID:", propertyId);
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies - userId:", userId, "role:", role);

    if (!userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, address, unitTypes, status } = body;

    // Validate request body
    if (!name || !address || !unitTypes || !status) {
      console.log("Missing required fields:", { name, address, unitTypes, status });
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    if (!Array.isArray(unitTypes) || unitTypes.length === 0) {
      console.log("Invalid unitTypes: must be a non-empty array");
      return NextResponse.json({ success: false, message: "Unit types must be a non-empty array" }, { status: 400 });
    }

    for (const unit of unitTypes) {
      if (
        !unit.type ||
        typeof unit.quantity !== "number" ||
        unit.quantity < 0 ||
        typeof unit.price !== "number" ||
        unit.price < 0 ||
        typeof unit.deposit !== "number" ||
        unit.deposit < 0
      ) {
        console.log("Invalid unit type:", unit);
        return NextResponse.json({ success: false, message: "Invalid unit type data" }, { status: 400 });
      }
    }

    const { db, client } = await connectToDatabase();
    try {
      const existing = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(propertyId),
        ownerId: userId,
      });

      if (!existing) {
        console.log("Property not found or access denied:", propertyId);
        return NextResponse.json({ success: false, message: "Property not found or access denied" }, { status: 404 });
      }

      const updateDoc: Partial<Property> = {
        name,
        address,
        unitTypes,
        status,
        updatedAt: new Date().toISOString(),
      };

      // Log unitTypes changes for debugging
      console.log("Updating property with unitTypes:", unitTypes);

      const result = await db.collection<Property>("properties").updateOne(
        { _id: new ObjectId(propertyId) },
        { $set: updateDoc }
      );

      if (result.matchedCount === 0) {
        console.log("No property matched for update:", propertyId);
        return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: "Property updated",
        property: { ...updateDoc, _id: propertyId, ownerId: userId, createdAt: existing.createdAt },
      });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("PUT error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}

// DELETE /api/properties/[propertyId]
export async function DELETE(request: NextRequest, context: { params: Promise<{ propertyId: string }> }) {
  try {
    const { propertyId } = await context.params;
    console.log("DELETE /api/properties/[propertyId] - Property ID:", propertyId);

    if (!ObjectId.isValid(propertyId)) {
      console.log("Invalid property ID:", propertyId);
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
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
      // Check for associated tenants
      const tenants = await db.collection<Tenant>("tenants").find({ propertyId }).toArray();
      if (tenants.length > 0) {
        console.log(`Found ${tenants.length} tenants associated with property ${propertyId}`);
        // Optionally delete tenants and their wallet transactions
        const tenantIds = tenants.map((t) => t._id);
        const tenantDeleteResult = await db.collection<Tenant>("tenants").deleteMany({ _id: { $in: tenantIds } });
        console.log(`Deleted ${tenantDeleteResult.deletedCount} tenants for property ${propertyId}`);

        // Delete associated wallet transactions
        const walletDeleteResult = await db.collection("walletTransactions").deleteMany({
          tenantId: { $in: tenantIds.map((id) => id.toString()) },
        });
        console.log(`Deleted ${walletDeleteResult.deletedCount} wallet transactions for property ${propertyId}`);
      }

      const result = await db.collection<Property>("properties").deleteOne({
        _id: new ObjectId(propertyId),
        ownerId: userId,
      });

      if (result.deletedCount === 0) {
        console.log("No property deleted:", propertyId);
        return NextResponse.json({ success: false, message: "Property not found or already deleted" }, { status: 404 });
      }

      return NextResponse.json({ success: true, message: "Property and associated tenants deleted successfully" });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("DELETE error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}
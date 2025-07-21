// src/app/api/properties/[propertyId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import { cookies } from "next/headers";

// DB Connection
const connectToDatabase = async () => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
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
}

interface Tenant {
  _id: ObjectId;
  propertyId: ObjectId | string;
}

// ✅ GET /api/properties/[propertyId]
export async function GET(request: NextRequest, { params }: { params: { propertyId: string } }) {
  try {
    const { propertyId } = params;

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || (role !== "tenant" && role !== "propertyOwner")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();
    let property: Property | null = null;

    if (role === "tenant") {
      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(userId) });

      if (!tenant || !tenant.propertyId || tenant.propertyId.toString() !== propertyId) {
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
      return NextResponse.json({ success: false, message: "Property not found or access denied" }, { status: 404 });
    }

    return NextResponse.json({ success: true, property }, { status: 200 });

  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// ✅ PUT /api/properties/[propertyId]
export async function PUT(request: NextRequest, { params }: { params: { propertyId: string } }) {
  try {
    const { propertyId } = params;

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();

    const existing = await db.collection("properties").findOne({
      _id: new ObjectId(propertyId),
      ownerId: userId,
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Property not found or access denied" }, { status: 404 });
    }

    const { name, address, unitTypes, status } = await request.json();

    const updateDoc = {
      name,
      address,
      unitTypes,
      status,
      updatedAt: new Date(),
    };

    await db.collection("properties").updateOne(
      { _id: new ObjectId(propertyId) },
      { $set: updateDoc }
    );

    return NextResponse.json({
      success: true,
      message: "Property updated",
      property: { ...updateDoc, _id: propertyId },
    });

  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// ✅ DELETE /api/properties/[propertyId]
export async function DELETE(_: NextRequest, { params }: { params: { propertyId: string } }) {
  try {
    const { propertyId } = params;

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();

    const result = await db.collection("properties").deleteOne({
      _id: new ObjectId(propertyId),
      ownerId: userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Property not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Property deleted successfully" });

  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

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
  propertyId: ObjectId | string; // Allow for ObjectId or string to handle conversion
}

// GET /api/properties/[propertyId]
export async function GET(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    // Await params to resolve the dynamic route parameter
    const { propertyId } = await params;
    console.log("GET /api/properties/[propertyId] - propertyId:", propertyId);

    if (!ObjectId.isValid(propertyId)) {
      console.log("Invalid ObjectId:", propertyId);
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("Cookies => userId:", userId, "role:", role);

    if (!userId || (role !== "tenant" && role !== "propertyOwner")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const db = await connectToDatabase();

    let property: Property | null = null;

    if (role === "tenant") {
      console.log("Tenant access attempt:", { userId, propertyId });

      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(userId) });

      console.log("Tenant lookup result:", tenant);

      // Convert propertyId to ObjectId for comparison
      const propertyIdObj = new ObjectId(propertyId);
      if (!tenant || !tenant.propertyId || tenant.propertyId.toString() !== propertyIdObj.toString()) {
        return NextResponse.json({ success: false, message: "Tenant not associated with this property" }, { status: 403 });
      }

      property = await db.collection<Property>("properties").findOne({
        _id: propertyIdObj,
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
    console.error("Server error in GET /api/properties/[propertyId]:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
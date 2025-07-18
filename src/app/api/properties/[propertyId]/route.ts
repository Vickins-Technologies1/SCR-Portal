import { NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
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

interface Property {
  _id: ObjectId;
  name: string;
  address: string;
  ownerId: string;
  unitTypes: UnitType[];
}

interface Tenant {
  _id: ObjectId;
  propertyId: string;
}

// GET Handler
export async function GET(request: Request, context: { params: Promise<{ propertyId: string }> }) {
  try {
    const params = await context.params; // Await params to resolve Promise
    const { propertyId } = params;
    console.log("GET /api/properties/[propertyId] - Property ID:", propertyId);

    if (!ObjectId.isValid(propertyId)) {
      console.log("Invalid property ID:", propertyId);
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
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
    let property;

    if (role === "tenant") {
      // Tenant accessing their leased property
      const tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(userId),
        propertyId: propertyId,
      });
      if (!tenant) {
        console.log("Tenant not associated with property ID:", propertyId);
        return NextResponse.json({ success: false, message: "Not authorized for this property" }, { status: 403 });
      }
      property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(propertyId),
      });
    } else if (role === "propertyOwner") {
      // Property owner accessing their property
      property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(propertyId),
        ownerId: userId,
      });
    }

    console.log("Property query result:", property);

    if (!property) {
      console.log("Property not found or not authorized for ID:", propertyId);
      return NextResponse.json({ success: false, message: "Property not found or not authorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true, property });
  } catch (error) {
    console.error("Error in GET /api/properties/[propertyId]:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
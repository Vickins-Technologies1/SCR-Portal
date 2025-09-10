// src/app/api/tenants/maintenance/[id]/route.ts
import { NextResponse, NextRequest } from "next/server";
import { Db, MongoClient, ObjectId, Collection } from "mongodb";
import { cookies } from "next/headers";

// Database connection with caching
const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
let cachedDb: Db | null = null;

const connectToDatabase = async (): Promise<Db> => {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    await client.connect();
    cachedDb = client.db("rentaldb");
    console.log("Connected to MongoDB database:", cachedDb.databaseName);
    return cachedDb;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw new Error("Database connection failed");
  }
};

// Get typed MongoDB collection
interface MaintenanceRequestDocument extends MaintenanceRequest {
  _id: ObjectId;
  tenantId: ObjectId;
  propertyId: ObjectId;
  ownerId: string;
}

const getMaintenanceCollection = async (): Promise<Collection<MaintenanceRequestDocument>> => {
  const db = await connectToDatabase();
  return db.collection<MaintenanceRequestDocument>("maintenance_requests");
};

// Types
interface MaintenanceRequest {
  _id: string | ObjectId;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  tenantId: string | ObjectId;
  propertyId: string | ObjectId;
  ownerId: string;
  date: string;
  urgency: "low" | "medium" | "high";
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Authenticate user
const authenticateUser = async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId || !role) {
    return { isValid: false, userId: null, role: null };
  }
  return { isValid: true, userId, role };
};

// PATCH /api/tenants/maintenance/[id]
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // Updated to Promise
): Promise<NextResponse<ApiResponse<MaintenanceRequest>>> {
  try {
    const { isValid, userId, role } = await authenticateUser();
    if (!isValid || !userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized: Property owner access required" },
        { status: 401 }
      );
    }

    const { id } = await context.params; // Await the params
    if (!ObjectId.isValid(id)) {
      console.log("Invalid maintenance request ID:", id);
      return NextResponse.json({ success: false, message: "Invalid maintenance request ID" }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    if (!["Pending", "In Progress", "Resolved"].includes(status)) {
      return NextResponse.json({ success: false, message: "Invalid status value" }, { status: 400 });
    }

    const collection = await getMaintenanceCollection();

    // Verify the request belongs to the property owner
    const request = await collection.findOne({
      _id: new ObjectId(id),
      ownerId: userId,
    });

    if (!request) {
      return NextResponse.json(
        { success: false, message: "Maintenance request not found or unauthorized" },
        { status: 404 }
      );
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to update maintenance request" },
        { status: 500 }
      );
    }

    const updatedRequest = {
      ...request,
      status,
      _id: request._id.toString(),
      tenantId: request.tenantId.toString(),
      propertyId: request.propertyId.toString(),
    };

    return NextResponse.json({ success: true, data: updatedRequest }, { status: 200 });
  } catch (error) {
    console.error("Error updating maintenance request:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update maintenance request" },
      { status: 500 }
    );
  }
}

// DELETE /api/tenants/maintenance/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // Updated to Promise
): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { isValid, userId, role } = await authenticateUser();
    if (!isValid || !userId || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized: Property owner access required" },
        { status: 401 }
      );
    }

    const { id } = await context.params; // Await the params
    if (!ObjectId.isValid(id)) {
      console.log("Invalid maintenance request ID:", id);
      return NextResponse.json({ success: false, message: "Invalid maintenance request ID" }, { status: 400 });
    }

    const collection = await getMaintenanceCollection();

    // Verify the request belongs to the property owner
    const request = await collection.findOne({
      _id: new ObjectId(id),
      ownerId: userId,
    });

    if (!request) {
      return NextResponse.json(
        { success: false, message: "Maintenance request not found or unauthorized" },
        { status: 404 }
      );
    }

    const result = await collection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to delete maintenance request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: null }, { status: 200 });
  } catch (error) {
    console.error("Error deleting maintenance request:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete maintenance request" },
      { status: 500 }
    );
  }
}
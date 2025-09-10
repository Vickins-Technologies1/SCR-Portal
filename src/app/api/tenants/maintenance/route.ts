// src/app/api/tenants/maintenance/route.ts
import { NextResponse, NextRequest } from "next/server";
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

interface Tenant {
  _id: string | ObjectId;
  propertyId: string | ObjectId;
  ownerId: string;
  name: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Sanitize input to prevent injection
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, "");
};

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

// GET /api/tenants/maintenance
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<{ requests: MaintenanceRequest[]; total: number }>>> {
  try {
    const { isValid, userId, role } = await authenticateUser();
    if (!isValid || !userId) {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized: User not logged in" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "5", 10);
    const skip = (page - 1) * limit;

    const db = await connectToDatabase();

    let requests: MaintenanceRequest[] = [];
    let total = 0;

    if (role === "tenant") {
      if (userId !== tenantId) {
        console.log("Unauthorized - tenantId mismatch:", userId, tenantId);
        return NextResponse.json({ success: false, message: "Unauthorized: Tenant ID mismatch" }, { status: 403 });
      }
      total = await db
        .collection<MaintenanceRequest>("maintenance_requests")
        .countDocuments({ tenantId: new ObjectId(userId) });
      requests = await db
        .collection<MaintenanceRequest>("maintenance_requests")
        .find({ tenantId: new ObjectId(userId) })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } else if (role === "propertyOwner") {
      total = await db
        .collection<MaintenanceRequest>("maintenance_requests")
        .countDocuments({ ownerId: userId });
      requests = await db
        .collection<MaintenanceRequest>("maintenance_requests")
        .find({ ownerId: userId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } else {
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 403 });
    }

    // Fetch tenant names for property owner view
    const tenantIds = [...new Set(requests.map((req) => req.tenantId.toString()))];
    const tenants = await db
      .collection<Tenant>("tenants")
      .find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) } })
      .toArray();

    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t.name]));

    // Convert ObjectId to string and add tenantName
    const formattedRequests = requests.map((req) => ({
      ...req,
      _id: req._id.toString(),
      tenantId: req.tenantId.toString(),
      propertyId: req.propertyId.toString(),
      tenantName: tenantMap.get(req.tenantId.toString()) || "Unknown Tenant",
    }));

    return NextResponse.json({ success: true, data: { requests: formattedRequests, total } }, { status: 200 });
  } catch (error) {
    console.error("Error fetching maintenance requests:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch maintenance requests" },
      { status: 500 }
    );
  }
}

// POST /api/tenants/maintenance
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<MaintenanceRequest>>> {
  try {
    const { isValid, userId, role } = await authenticateUser();
    if (!isValid || !userId || role !== "tenant") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json({ success: false, message: "Unauthorized: Tenant access required" }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, title, description, urgency, propertyId } = body;

    if (!tenantId || tenantId !== userId) {
      console.log("Invalid tenantId:", tenantId, "userId:", userId);
      return NextResponse.json({ success: false, message: "Invalid or unauthorized tenant ID" }, { status: 403 });
    }

    if (!title || !description || !urgency || !propertyId) {
      return NextResponse.json(
        { success: false, message: "Title, description, urgency, and propertyId are required" },
        { status: 400 }
      );
    }

    if (!["low", "medium", "high"].includes(urgency)) {
      return NextResponse.json({ success: false, message: "Invalid urgency value" }, { status: 400 });
    }

    const db = await connectToDatabase();

    // Verify tenant exists and get ownerId
    const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Verify propertyId matches tenant's propertyId
    if (tenant.propertyId.toString() !== propertyId) {
      return NextResponse.json(
        { success: false, message: "Invalid property ID for this tenant" },
        { status: 403 }
      );
    }

    const newRequest: MaintenanceRequest = {
      _id: new ObjectId(),
      title: sanitizeInput(title),
      description: sanitizeInput(description),
      status: "Pending",
      tenantId,
      propertyId,
      ownerId: tenant.ownerId,
      date: new Date().toISOString(),
      urgency,
    };

    await db.collection<MaintenanceRequest>("maintenance_requests").insertOne({
      ...newRequest,
      _id: new ObjectId(newRequest._id),
      tenantId: new ObjectId(tenantId),
      propertyId: new ObjectId(propertyId),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...newRequest,
          _id: newRequest._id.toString(),
          tenantId: newRequest.tenantId.toString(),
          propertyId: newRequest.propertyId.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating maintenance request:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create maintenance request" },
      { status: 500 }
    );
  }
}
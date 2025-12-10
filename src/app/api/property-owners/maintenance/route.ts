// src/app/api/property-owners/maintenance/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Db, MongoClient, ObjectId } from "mongodb";

// ─────────────────────────────────────────────────────────────────────────────
// DB Document Types – These match exactly what’s stored in MongoDB
// ─────────────────────────────────────────────────────────────────────────────
interface TenantDocument {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  ownerId: string;
  role: "tenant";
  propertyId: string;
  unitType: string;
  unitIdentifier: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: "active" | "inactive" | "evicted";
  paymentStatus: "current" | "overdue" | "paid";
  createdAt: Date;
  updatedAt?: Date;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
  deliveryMethod?: "sms" | "email" | "whatsapp" | "both" | "app";
}

interface MaintenanceRequestDocument {
  _id: ObjectId;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  tenantId: ObjectId;
  propertyId: ObjectId;
  ownerId: string;
  date: string;
  urgency: "low" | "medium" | "high";
}

// ─────────────────────────────────────────────────────────────────────────────
// Response type sent to frontend
// ─────────────────────────────────────────────────────────────────────────────
interface MaintenanceRequestResponse {
  _id: string;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  tenantId: string;
  propertyId: string;
  date: string;
  urgency: "low" | "medium" | "high";
  tenantName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database connection (cached)
// ─────────────────────────────────────────────────────────────────────────────
const client = new MongoClient(process.env.MONGODB_URI!);
let cachedDb: Db | null = null;

const connectToDatabase = async (): Promise<Db> => {
  if (cachedDb) return cachedDb;
  await client.connect();
  cachedDb = client.db("rentaldb");
  return cachedDb;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/property-owners/maintenance
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = await connectToDatabase();

    // 1. Get all property IDs owned by this owner
    const properties = await db
      .collection("properties")
      .find({ ownerId: userId })
      .toArray();

    const propertyIds = properties.map((p) => p._id as ObjectId);

    if (propertyIds.length === 0) {
      return NextResponse.json({ success: true, data: { requests: [] } });
    }

    // 2. Fetch maintenance requests
    const maintenanceColl = db.collection<MaintenanceRequestDocument>("maintenance_requests");
    const tenantColl = db.collection<TenantDocument>("tenants");

    const requests = await maintenanceColl
      .find({ propertyId: { $in: propertyIds } })
      .sort({ date: -1 })
      .toArray();

    // 3. Enrich with tenant name
    const enrichedRequests: MaintenanceRequestResponse[] = await Promise.all(
      requests.map(async (req) => {
        let tenantName = "Unknown Tenant";

        if (req.tenantId) {
          const tenant = await tenantColl.findOne(
            { _id: req.tenantId }, // ObjectId matches ObjectId → TypeScript happy!
            { projection: { name: 1, email: 1 } }
          );

          if (tenant) {
            tenantName = tenant.name || tenant.email || "Unknown Tenant";
          }
        }

        return {
          _id: req._id.toString(),
          title: req.title,
          description: req.description,
          status: req.status,
          tenantId: req.tenantId.toString(),
          propertyId: req.propertyId.toString(),
          date: req.date,
          urgency: req.urgency,
          tenantName,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { requests: enrichedRequests },
    });
  } catch (error) {
    console.error("Error in /api/property-owners/maintenance:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch maintenance requests" },
      { status: 500 }
    );
  }
}
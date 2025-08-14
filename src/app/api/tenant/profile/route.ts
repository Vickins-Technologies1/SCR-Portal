import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface Tenant {
  _id: ObjectId;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: Date;
  updatedAt?: Date;
  walletBalance: number;
  status?: string; // Optional, to match frontend
  paymentStatus?: string; // Optional, to match frontend
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("GET /api/tenant/profile - Cookies - userId:", userId, "role:", role);

    if (!userId || !ObjectId.isValid(userId) || role !== "tenant") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a tenant." },
        { status: 401 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    console.log("GET /api/tenant/profile - Connected to database: rentaldb, collection: tenants");

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(userId),
    });

    if (!tenant) {
      console.log("Tenant not found:", userId);
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    // Convert updatedAt to Date if it’s a string, or handle undefined
    const updatedAt = tenant.updatedAt
      ? tenant.updatedAt instanceof Date
        ? tenant.updatedAt
        : new Date(tenant.updatedAt)
      : undefined;

    console.log("Tenant fetched successfully:", { tenantId: userId });
    return NextResponse.json(
      {
        success: true,
        tenant: {
          ...tenant,
          _id: tenant._id.toString(),
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: updatedAt ? updatedAt.toISOString() : undefined, // Only call toISOString if updatedAt exists
          wallet: tenant.walletBalance ?? 0,
          status: tenant.status || "active",
          paymentStatus: tenant.paymentStatus || "N/A",
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in GET /api/tenant/profile:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
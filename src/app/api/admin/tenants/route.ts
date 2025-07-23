// src/app/api/admin/tenants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { Tenant, ResponseTenant } from "../../../../types/tenant";

interface ApiResponse {
  success: boolean;
  message?: string;
  tenants?: ResponseTenant[];
  count?: number;
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    console.log('Unauthorized - role:', role);
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const tenants = await db.collection<Tenant>("tenants").find().toArray();
    return NextResponse.json({
      success: true,
      tenants: tenants.map((t) => ({
        ...t,
        _id: t._id.toString(),
        propertyId: t.propertyId.toString(),
        ownerId: t.ownerId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt?.toISOString(),
        walletBalance: t.walletBalance || 0,
      })),
      count: tenants.length,
    });
  } catch (error: any) {
    console.error("Tenants fetch error:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch tenants" }, { status: 500 });
  }
}
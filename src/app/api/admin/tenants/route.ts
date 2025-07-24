import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";
import { Tenant } from "../../../../types/tenant";

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
  } catch (error: unknown) {
    console.error("Tenants fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch tenants" }, { status: 500 });
  }
}
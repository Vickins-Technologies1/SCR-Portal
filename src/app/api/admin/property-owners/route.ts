import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  console.log("GET /api/admin/property-owners - Cookie role:", role);

  if (role !== "admin") {
    console.log("Unauthorized access - role:", role);
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const propertyOwners = await db
      .collection("propertyOwners")
      .find({ role: "propertyOwner" })
      .project({ _id: 1, email: 1, name: 1, phone: 1, role: 1, createdAt: 1 })
      .toArray();
    const count = await db.collection("propertyOwners").countDocuments({ role: "propertyOwner" });

    return NextResponse.json({
      success: true,
      propertyOwners: propertyOwners.map((po) => ({
        ...po,
        _id: po._id.toString(),
        createdAt: po.createdAt ? (po.createdAt instanceof Date ? po.createdAt.toISOString() : String(po.createdAt)) : "Not set",
      })),
      count,
    });
  } catch (error: unknown) {
    console.error("Property owners fetch error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Failed to fetch property owners" }, { status: 500 });
  }
}
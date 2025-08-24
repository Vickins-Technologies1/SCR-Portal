import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  console.log("GET /api/admin/tenants - Cookie role:", role);

  if (role !== "admin") {
    console.log("Unauthorized access - role:", role);
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const tenants = await db
      .collection("tenants")
      .find({ role: "tenant" })
      .project({ _id: 1, email: 1, name: 1, phone: 1, role: 1, createdAt: 1, updatedAt: 1 })
      .toArray();
    const count = await db.collection("tenants").countDocuments({ role: "tenant" });

    return NextResponse.json({
      success: true,
      tenants: tenants.map((t) => ({
        ...t,
        _id: t._id.toString(),
        createdAt: t.createdAt ? (t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt)) : "Not set",
        updatedAt: t.updatedAt ? (t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt)) : "Not set",
      })),
      count,
    });
  } catch (error: unknown) {
    console.error("Tenants fetch error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Failed to fetch tenants" }, { status: 500 });
  }
}
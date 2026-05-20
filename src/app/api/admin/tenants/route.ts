import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:properties:view");
  if (auth instanceof NextResponse) return auth;

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

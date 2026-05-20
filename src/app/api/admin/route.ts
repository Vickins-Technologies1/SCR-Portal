// src/app/api/admin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { requireAdmin } from "../../../lib/admin-auth";

interface User {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:dashboard:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db }: { db: Db } = await connectToDatabase();
    
    // Fetch admin count
    const count = await db.collection<User>("propertyOwners").countDocuments({ role: "admin" });

    // Fetch admin details (optional, for consistency)
    const admins = await db
      .collection<User>("propertyOwners")
      .find({ role: "admin" })
      .project<User>({ _id: 1, name: 1, email: 1 })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        count: count || 0, // Ensure count is always a number
        admins: admins.map((a) => ({
          _id: a._id.toString(),
          name: a.name || "N/A",
          email: a.email || "N/A",
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Admins fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Failed to fetch admins: Server error" },
      { status: 500 }
    );
  }
}

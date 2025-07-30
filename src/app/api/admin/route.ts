import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface User {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;

  // Validate role cookie
  if (!role || role !== "admin") {
    console.log("Unauthorized access attempt - role:", role || "missing");
    return NextResponse.json(
      { success: false, message: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    
    // Fetch admin count
    const count = await db.collection<User>("users").countDocuments({ role: "admin" });

    // Fetch admin details (optional, for consistency)
    const admins = await db
      .collection<User>("users")
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
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface User {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
  // Add other fields as needed based on your users collection schema
}

interface AdminResponse {
  success: boolean;
  admins?: { _id: string; name: string; email: string }[];
  count?: number;
  message?: string;
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    console.log('Unauthorized - role:', role);
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const admins = await db
      .collection<User>("users")
      .find({ role: "admin" })
      .project<User>({ _id: 1, name: 1, email: 1 })
      .toArray();
    const count = await db.collection<User>("users").countDocuments({ role: "admin" });

    return NextResponse.json({
      success: true,
      admins: admins.map((a) => ({
        _id: a._id.toString(),
        name: a.name,
        email: a.email,
      })),
      count,
    }, { status: 200 });
  } catch (error) {
    console.error("Admins fetch error:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch admins" }, { status: 500 });
  }
}
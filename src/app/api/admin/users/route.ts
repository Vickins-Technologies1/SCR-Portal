import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const users = await db
      .collection("users")
      .find()
      .project({ _id: 1, name: 1, email: 1, role: 1 })
      .toArray();
    const count = await db.collection("users").countDocuments();

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        ...u,
        _id: u._id.toString(),
      })),
      count,
    });
  } catch (error: unknown) {
    console.error("Users fetch error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Failed to fetch users" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
};

export async function POST(request: Request) {
  try {
    const { tenantId, userId } = await request.json();
    if (!ObjectId.isValid(tenantId) || !userId) {
      return NextResponse.json({ success: false, message: "Invalid tenant ID or user ID" }, { status: 400 });
    }

    const cookies = request.headers.get("cookie");
    const currentUserId = cookies?.match(/userId=([^;]+)/)?.[1];
    const role = cookies?.match(/role=([^;]+)/)?.[1];

    if (!currentUserId || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    if (currentUserId !== userId) {
      return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 403 });
    }

    const db = await connectToDatabase(); // Directly assign Db
    const tenant = await db.collection("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found or not authorized" }, { status: 404 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("userId", tenantId, { path: "/", maxAge: 24 * 60 * 60 });
    response.cookies.set("role", "tenant", { path: "/", maxAge: 24 * 60 * 60 });
    return response;
  } catch (error) {
    console.error("Error in POST /api/impersonate:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const role = searchParams.get("role");

    if (!userId || !role) {
      console.log("Missing userId or role:", { userId, role });
      return NextResponse.json(
        { success: false, message: "User ID and role are required" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(userId)) {
      console.log("Invalid ObjectId:", userId);
      return NextResponse.json(
        { success: false, message: "Invalid user ID format" },
        { status: 400 }
      );
    }

    if (role !== "tenant" && role !== "propertyOwner") {
      console.log("Invalid role:", role);
      return NextResponse.json(
        { success: false, message: "Role must be 'tenant' or 'propertyOwner'" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to database");

    let user = null;
    if (role === "tenant") {
      user = await db.collection("tenants").findOne({ _id: new ObjectId(userId), role: "tenant" });
    } else if (role === "propertyOwner") {
      user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId), role: "propertyOwner" });
    }

    if (user) {
      // Exclude password from response by spreading all fields except password
      const { ...userData } = user; // Removed explicit password destructuring
      return NextResponse.json(
        { success: true, user: { ...userData, userId: user._id.toString() } },
        { status: 200 }
      );
    }

    console.log("No user found for userId:", userId);
    return NextResponse.json(
      { success: false, message: "User not found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("User fetch error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
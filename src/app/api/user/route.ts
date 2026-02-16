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

    const { db } = await connectToDatabase();
    console.log("Connected to database");

    let user = null;
    let collectionName = "";

    switch (role) {
      case "tenant":
        collectionName = "tenants";
        user = await db.collection(collectionName).findOne({
          _id: new ObjectId(userId),
          role: "tenant",
        });
        break;

      case "propertyOwner":
        collectionName = "propertyOwners";
        user = await db.collection(collectionName).findOne({
          _id: new ObjectId(userId),
          role: "propertyOwner",
        });
        break;

      case "teamMember":
        collectionName = "teamMembers";
        user = await db.collection(collectionName).findOne({
          _id: new ObjectId(userId),
          role: "teamMember",
          active: true, // optional: only return active members
        });
        break;

      default:
        console.log("Invalid role:", role);
        return NextResponse.json(
          { success: false, message: "Invalid role. Must be 'tenant', 'propertyOwner' or 'teamMember'" },
          { status: 400 }
        );
    }

    if (!user) {
      console.log(`No user found in ${collectionName} for userId:`, userId);
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Remove sensitive fields from response
    const { password, ...safeUserData } = user;

    return NextResponse.json(
      {
        success: true,
        user: {
          ...safeUserData,
          userId: user._id.toString(), // for consistency
          // Ensure these fields exist (they should from teamMembers collection)
          name: user.name || "Unknown",
          teamRole: user.teamRole || "Team Member",
          // You can include permissions here too if you want (optional)
          permissions: user.permissions || [],
        },
      },
      { status: 200 }
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
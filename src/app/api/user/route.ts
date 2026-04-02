import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../../../lib/session";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = sessionCookie ? await verifySessionToken(sessionCookie) : null;

    if (!session || !session.sub || !session.role) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.sub;
    const role = session.role;

    if (!ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
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
        return NextResponse.json(
          { success: false, message: "Invalid role. Must be 'tenant', 'propertyOwner' or 'teamMember'" },
          { status: 400 }
        );
    }

    if (!user) {
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

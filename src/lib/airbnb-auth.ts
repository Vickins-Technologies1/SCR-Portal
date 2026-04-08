import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "./mongodb";
import { ObjectId } from "mongodb";

export type AirbnbOwnerContext = {
  ownerId: string;
  userId: string;
  role: "propertyOwner" | "teamMember";
};

export async function resolveAirbnbOwner(
  request: NextRequest,
  requestedOwnerId?: string | null
): Promise<{ context?: AirbnbOwnerContext; response?: NextResponse }> {
  const role = request.cookies.get("role")?.value as AirbnbOwnerContext["role"] | undefined;
  const userId = request.cookies.get("userId")?.value;

  if (!userId || !role || !["propertyOwner", "teamMember"].includes(role)) {
    return {
      response: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }),
    };
  }

  if (role === "propertyOwner") {
    const ownerId = requestedOwnerId || userId;
    if (ownerId !== userId) {
      return {
        response: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }),
      };
    }
    return { context: { ownerId, userId, role } };
  }

  const { db } = await connectToDatabase();
  if (!ObjectId.isValid(userId)) {
    return {
      response: NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 401 }),
    };
  }
  const teamMember = await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), active: true });
  const ownerId = teamMember?.ownerId?.toString?.() || (typeof teamMember?.ownerId === "string" ? teamMember.ownerId : null);

  if (!ownerId) {
    return {
      response: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 }),
    };
  }

  if (requestedOwnerId && requestedOwnerId !== ownerId) {
    return {
      response: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }),
    };
  }

  return { context: { ownerId, userId, role } };
}

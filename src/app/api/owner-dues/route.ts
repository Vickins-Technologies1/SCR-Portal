import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { getOwnerDueStatus } from "../../../lib/billing";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    const ownerIdCookie = cookieStore.get("ownerId")?.value;

    if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const ownerId = role === "propertyOwner" ? userId : (ownerIdCookie || userId);

    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const dueStatus = await getOwnerDueStatus(db, ownerId, new Date());

    return NextResponse.json({ success: true, ...dueStatus });
  } catch (error: unknown) {
    console.error("GET /api/owner-dues error", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

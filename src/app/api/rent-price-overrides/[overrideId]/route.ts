import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { RentPriceOverride } from "@/types/rent-price-override";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> }
) {
  try {
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(request, csrfHeader)) {
      return buildInvalidCsrfResponse(request);
    }

    const { overrideId } = await params;
    if (!overrideId || !ObjectId.isValid(overrideId)) {
      return NextResponse.json({ success: false, message: "Valid overrideId is required" }, { status: 400 });
    }

    const cookies = request.cookies;
    const role = cookies.get("role")?.value;
    const userId = cookies.get("userId")?.value;

    if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const override = await db.collection<RentPriceOverride>("rentPriceOverrides").findOne({
      _id: new ObjectId(overrideId),
    });

    if (!override) {
      return NextResponse.json({ success: false, message: "Override not found" }, { status: 404 });
    }

    const ownerId = String(override.ownerId);
    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid override owner" }, { status: 400 });
    }

    if (role === "propertyOwner" && ownerId !== userId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        ownerId: new ObjectId(ownerId),
        active: true,
      });
      if (!teamMember) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    await db.collection<RentPriceOverride>("rentPriceOverrides").updateOne(
      { _id: new ObjectId(overrideId) },
      { $set: { status: "inactive", updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true, message: "Override cancelled" }, { status: 200 });
  } catch (error) {
    console.error("DELETE /rent-price-overrides error", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

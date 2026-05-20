// src/app/api/admin/property-owners/[id]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAdmin } from "../../../../../../lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireAdmin(request, "admin:owners:manage");
  if (auth instanceof NextResponse) return auth;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    const result = await db.collection("propertyOwners").findOneAndUpdate(
      {
        _id: new ObjectId(id),
        isApproved: { $ne: true }, // only update if not already approved
      },
      {
        $set: {
          isApproved: true,
          approvedAt: new Date(),
          // approvedBy: adminId or admin email — optional
          // You could get current admin from session/cookie if needed
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json(
        { success: false, message: "User not found or already approved" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Property owner approved",
      propertyOwner: {
        _id: result._id.toString(),
        isApproved: result.isApproved,
        approvedAt: result.approvedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Approve error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

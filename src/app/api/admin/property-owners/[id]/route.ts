import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    const result = await db.collection("propertyOwners").deleteOne({
      _id: new ObjectId(id),
      isApproved: false, // only allow deleting pending users (safety)
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "User not found or already approved" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Pending user rejected and deleted",
    });
  } catch (error) {
    console.error("Delete pending user error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
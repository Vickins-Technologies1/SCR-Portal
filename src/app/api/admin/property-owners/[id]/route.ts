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

    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(id) });
    if (!owner) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    if (owner.isApproved === true) {
      return NextResponse.json(
        { success: false, message: "Approved owners cannot be deleted" },
        { status: 400 }
      );
    }

    const result = await db.collection("propertyOwners").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Delete failed" }, { status: 500 });
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

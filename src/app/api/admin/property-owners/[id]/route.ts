import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { cascadeDeleteOwner } from "../../../../../lib/admin-owner-delete";
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
    const { db, client } = await connectToDatabase();

    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(id) });
    if (!owner) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const deleted = await cascadeDeleteOwner({ db, client, ownerId: id });

    if (deleted.owner === 0) {
      return NextResponse.json({ success: false, message: "Delete failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Owner and related data deleted",
      deleted,
    });
  } catch (error) {
    console.error("Delete owner error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

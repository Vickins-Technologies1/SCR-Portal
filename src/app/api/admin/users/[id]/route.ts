// src/app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { cascadeDeleteOwner } from "../../../../../lib/admin-owner-delete";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const role = request.cookies.get("role")?.value;

  if (role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const owner = await db
      .collection("propertyOwners")
      .findOne({ _id: new ObjectId(id) });

    if (!owner) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      propertyOwner: {
        ...owner,
        _id: owner._id.toString(),
        createdAt:
          owner.createdAt instanceof Date
            ? owner.createdAt.toISOString()
            : String(owner.createdAt),
      },
    });
  } catch (error) {
    console.error("User fetch error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const role = request.cookies.get("role")?.value;

  if (role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, email, phone } = body;

    const { db } = await connectToDatabase();

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    const result = await db
      .collection("propertyOwners")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" }
      );

    if (!result) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      propertyOwner: {
        ...result,
        _id: result._id.toString(),
        createdAt:
          result.createdAt instanceof Date
            ? result.createdAt.toISOString()
            : String(result.createdAt),
      },
    });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const role = request.cookies.get("role")?.value;

  if (role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID" },
      { status: 400 }
    );
  }

  const userObjectId = new ObjectId(id);
  try {
    const { db, client } = await connectToDatabase();
    const owner = await db.collection("propertyOwners").findOne({ _id: userObjectId });
    if (!owner) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const deletedCounts = await cascadeDeleteOwner({ db, client, ownerId: id });
    if (deletedCounts.owner === 0) {
      return NextResponse.json(
        { success: false, message: "Delete failed" },
        { status: 500 }
      );
    }

    console.log(`User ${id} fully deleted:`, deletedCounts);

    return NextResponse.json({
      success: true,
      message: "User and all related data deleted",
      deleted: deletedCounts,
    });
  } catch (error) {
    console.error("Cascade delete failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete user" },
      { status: 500 }
    );
  }
}

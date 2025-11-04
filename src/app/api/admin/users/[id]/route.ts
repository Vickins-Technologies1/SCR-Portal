// src/app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(request: NextRequest, context: any) {
  const { id } = context.params as { id: string };
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();
    const owner = await db
      .collection("propertyOwners")
      .findOne({ _id: new ObjectId(id) });

    if (!owner) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      propertyOwner: {
        ...owner,
        _id: owner._id.toString(),
        createdAt: owner.createdAt instanceof Date ? owner.createdAt.toISOString() : String(owner.createdAt),
      },
    });
  } catch (error: unknown) {
    console.error("User fetch error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PUT(request: NextRequest, context: any) {
  const { id } = context.params as { id: string };
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    const { name, email, phone } = await request.json();
    const { db }: { db: Db } = await connectToDatabase();

    const updateData = {
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      updatedAt: new Date(),
    };

    const result = await db
      .collection("propertyOwners")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" }
      );

    if (!result) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      propertyOwner: {
        ...result,
        _id: result._id.toString(),
        createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : String(result.createdAt),
      },
    });
  } catch (error: unknown) {
    console.error("User update error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(request: NextRequest, context: any) {
  const { id } = context.params as { id: string };
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();
    const result = await db
      .collection("propertyOwners")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "User deleted successfully" });
  } catch (error: unknown) {
    console.error("User delete error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
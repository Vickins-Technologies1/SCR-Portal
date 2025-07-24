import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const owner = await db
      .collection("propertyOwners")
      .findOne({ _id: new ObjectId(params.id) });

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
  } catch (error: any) {
    console.error("User fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
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
        { _id: new ObjectId(params.id) },
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
  } catch (error: any) {
    console.error("User update error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const result = await db
      .collection("propertyOwners")
      .deleteOne({ _id: new ObjectId(params.id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "User deleted successfully" });
  } catch (error: any) {
    console.error("User delete error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
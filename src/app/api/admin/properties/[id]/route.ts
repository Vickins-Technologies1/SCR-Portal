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
    const property = await db
      .collection("properties")
      .findOne({ _id: new ObjectId(params.id) });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      property: {
        ...property,
        _id: property._id.toString(),
      },
    });
  } catch (error: any) {
    console.error("Property fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, ownerId } = await request.json();
    const { db }: { db: Db } = await connectToDatabase();

    const updateData = {
      ...(name && { name }),
      ...(ownerId && { ownerId }),
      updatedAt: new Date(),
    };

    const result = await db
      .collection("properties")
      .findOneAndUpdate(
        { _id: new ObjectId(params.id) },
        { $set: updateData },
        { returnDocument: "after" }
      );

    if (!result) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      property: {
        ...result,
        _id: result._id.toString(),
      },
    });
  } catch (error: any) {
    console.error("Property update error:", error);
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
      .collection("properties")
      .deleteOne({ _id: new ObjectId(params.id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Property deleted successfully" });
  } catch (error: any) {
    console.error("Property delete error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
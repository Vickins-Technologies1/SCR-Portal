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
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();
    const property = await db
      .collection("properties")
      .findOne({ _id: new ObjectId(id) });

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
  } catch (error: unknown) {
    console.error("Property fetch error:", error);
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
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

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
        { _id: new ObjectId(id) },
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
  } catch (error: unknown) {
    console.error("Property update error:", error);
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
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();
    const result = await db
      .collection("properties")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Property deleted successfully" });
  } catch (error: unknown) {
    console.error("Property delete error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
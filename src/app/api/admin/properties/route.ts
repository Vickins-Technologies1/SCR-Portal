import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const properties = await db.collection("properties").find({}).toArray();
    return NextResponse.json({
      success: true,
      properties: properties.map((property) => ({
        ...property,
        _id: property._id.toString(),
      })),
    });
  } catch (error: unknown) {
    console.error("Properties fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, ownerId } = await request.json();
    const { db }: { db: Db } = await connectToDatabase();

    const newProperty = {
      name,
      ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("properties").insertOne(newProperty);

    return NextResponse.json({
      success: true,
      property: {
        ...newProperty,
        _id: result.insertedId.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("Property creation error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

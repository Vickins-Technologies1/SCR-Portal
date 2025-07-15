import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";

export async function GET(request: Request) {
  try {
    console.log("Handling GET request to /api/properties");
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "User ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const properties = await db
      .collection("properties")
      .find({ ownerId: userId })
      .toArray();
    console.log(`Properties fetched for userId ${userId}:`, properties);
    return NextResponse.json({ success: true, properties });
  } catch (error) {
    console.error("Error fetching properties:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    console.log("Handling POST request to /api/properties");
    const { db } = await connectToDatabase();
    const { name, address, unitTypes, status, ownerId } = await request.json();

    // Validate required fields
    if (!name || !address || !unitTypes || !Array.isArray(unitTypes) || unitTypes.length === 0 || !status || !ownerId) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid required fields" },
        { status: 400 }
      );
    }

    // Validate unitTypes
    for (const unit of unitTypes) {
      if (
        !unit.type ||
        typeof unit.quantity !== "number" ||
        unit.quantity < 0 ||
        typeof unit.price !== "number" ||
        unit.price < 0 ||
        typeof unit.deposit !== "number" ||
        unit.deposit < 0
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid unit type, quantity, price, or deposit" },
          { status: 400 }
        );
      }
    }

    const newProperty = {
      id: (await db.collection("properties").countDocuments({ ownerId }) + 1).toString(),
      name,
      address,
      unitTypes,
      status,
      ownerId,
      createdAt: new Date(),
    };

    const result = await db.collection("properties").insertOne(newProperty);

    return NextResponse.json(
      { success: true, property: { ...newProperty, _id: result.insertedId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating property:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
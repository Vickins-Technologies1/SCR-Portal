import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    console.log("Handling GET request to /api/properties");
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || searchParams.get("tenantId");


    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const role = cookieStore.get("role")?.value;

    if (!role || (role !== "propertyOwner" && role !== "tenant")) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Invalid role" },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();

    if (role === "propertyOwner") {
      // Return all properties owned by this user
      const properties = await db
        .collection("properties")
        .find({ ownerId: userId })
        .toArray();

      console.log(`Properties fetched for ownerId ${userId}:`, properties);

      return NextResponse.json({ success: true, properties });
    }

    if (role === "tenant") {
      // Find tenant and get their property
      const tenant = await db.collection("tenants").findOne({
        _id: new ObjectId(userId),
      });

      if (!tenant) {
        return NextResponse.json(
          { success: false, message: "Tenant not found" },
          { status: 404 }
        );
      }

      const property = await db.collection("properties").findOne({
        _id: new ObjectId(tenant.propertyId),
      });

      if (!property) {
        return NextResponse.json(
          { success: false, message: "Property not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, property });
    }

    return NextResponse.json(
      { success: false, message: "Unhandled role" },
      { status: 500 }
    );
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
    if (
      !name ||
      !address ||
      !unitTypes ||
      !Array.isArray(unitTypes) ||
      unitTypes.length === 0 ||
      !status ||
      !ownerId
    ) {
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

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
      console.log("Invalid or missing user ID:", userId);
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const role = cookieStore.get("role")?.value;

    if (!role || (role !== "propertyOwner" && role !== "tenant")) {
      console.log("Unauthorized - role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized: Invalid role" },
        { status: 401 }
      );
    }

    const { db, client } = await connectToDatabase();

    try {
      if (role === "propertyOwner") {
        // Return all properties owned by this user
        const properties = await db
          .collection("properties")
          .find({ ownerId: userId })
          .toArray();

        console.log(`Properties fetched for ownerId ${userId}:`, properties);

        return NextResponse.json({
          success: true,
          properties: properties.map((prop) => ({
            ...prop,
            _id: prop._id.toString(),
            createdAt: prop.createdAt.toISOString(),
          })),
        });
      }

      if (role === "tenant") {
        // Find tenant and get their property
        const tenant = await db.collection("tenants").findOne({
          _id: new ObjectId(userId),
        });

        if (!tenant) {
          console.log("Tenant not found for ID:", userId);
          return NextResponse.json(
            { success: false, message: "Tenant not found" },
            { status: 404 }
          );
        }

        const property = await db.collection("properties").findOne({
          _id: new ObjectId(tenant.propertyId),
        });

        if (!property) {
          console.log("Property not found for tenant's propertyId:", tenant.propertyId);
          return NextResponse.json(
            { success: false, message: "Property not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          property: {
            ...property,
            _id: property._id.toString(),
            createdAt: property.createdAt.toISOString(),
          },
        });
      }

      console.log("Unhandled role:", role);
      return NextResponse.json(
        { success: false, message: "Unhandled role" },
        { status: 500 }
      );
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error fetching properties:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    console.log("Handling POST request to /api/properties");
    const { db, client } = await connectToDatabase();
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
      console.log("Missing or invalid required fields:", { name, address, unitTypes, status, ownerId });
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
        console.log("Invalid unit type data:", unit);
        return NextResponse.json(
          { success: false, message: "Invalid unit type, quantity, price, or deposit" },
          { status: 400 }
        );
      }
    }

    const cookieStore = await cookies();
    const role = cookieStore.get("role")?.value;
    const userId = cookieStore.get("userId")?.value;

    if (!userId || role !== "propertyOwner" || userId !== ownerId) {
      console.log("Unauthorized - role:", role, "userId:", userId, "ownerId:", ownerId);
      return NextResponse.json(
        { success: false, message: "Unauthorized: Only property owners can create properties" },
        { status: 401 }
      );
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

    try {
      return NextResponse.json(
        {
          success: true,
          property: {
            ...newProperty,
            _id: result.insertedId.toString(),
            createdAt: newProperty.createdAt.toISOString(),
          },
        },
        { status: 201 }
      );
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error creating property:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";

export async function GET(request: Request) {
  try {
    console.log("Handling GET request to /api/tenants");
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "User ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const tenants = await db
      .collection("tenants")
      .find({ ownerId: userId })
      .toArray();
    console.log(`Tenants fetched for userId ${userId}:`, tenants);
    return NextResponse.json({ success: true, tenants });
  } catch (error) {
    console.error("Error fetching tenants:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    console.log("Handling POST request to /api/tenants");
    const { db } = await connectToDatabase();
    const {
      name,
      email,
      phone,
      password,
      role,
      ownerId,
      propertyId,
      unitType,
      price,
      deposit,
      houseNumber,
    } = await request.json();

    // Basic validation
    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      role !== "tenant" ||
      !ownerId ||
      !propertyId ||
      !unitType ||
      !price ||
      !deposit ||
      !houseNumber
    ) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check for email uniqueness
    const existingTenant = await db.collection("tenants").findOne({ email });
    if (existingTenant) {
      return NextResponse.json(
        { success: false, message: "Email already exists" },
        { status: 400 }
      );
    }

    // Validate propertyId exists and belongs to ownerId
    const property = await db.collection("properties").findOne({ _id: propertyId, ownerId });
    if (!property) {
      return NextResponse.json(
        { success: false, message: "Invalid property ID or property does not belong to user" },
        { status: 400 }
      );
    }

    // Validate unitType exists in the property and check price
    const unit = property.unitTypes.find((u: any) => u.type === unitType);
    if (!unit) {
      return NextResponse.json(
        { success: false, message: "Invalid unit type for selected property" },
        { status: 400 }
      );
    }
    if (price < 0 || deposit < 0) {
      return NextResponse.json(
        { success: false, message: "Price and deposit must be non-negative" },
        { status: 400 }
      );
    }

    const newTenant = {
      id: (await db.collection("tenants").countDocuments({ ownerId }) + 1).toString(),
      name,
      email,
      phone,
      propertyId,
      unitType,
      price: parseFloat(price),
      deposit: parseFloat(deposit),
      houseNumber,
      status: "active",
      ownerId,
      role,
      createdAt: new Date(),
    };

    const result = await db.collection("tenants").insertOne(newTenant);

    // Simulate sending login credentials
    console.log(`Simulating email to ${email}: Your tenant portal login - Email: ${email}, Password: ${password}`);

    return NextResponse.json(
      { success: true, tenant: { ...newTenant, _id: result.insertedId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating tenant:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
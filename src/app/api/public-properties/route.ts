// src/app/api/public-properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  console.log("Handling GET request to /api/public-properties");

  try {
    const { db } = await connectToDatabase();
    const properties = await db
      .collection("propertyListings")
      .find({ status: "Active" })
      .toArray();

    // Convert MongoDB _id to string and ensure dates are serialized
    const formattedProperties = properties.map((property) => ({
      _id: property._id.toString(),
      name: property.name,
      address: property.address,
      unitTypes: property.unitTypes,
      status: property.status,
      createdAt: property.createdAt.toISOString(),
      updatedAt: property.updatedAt.toISOString(),
      images: property.images || [],
      isAdvertised: property.isAdvertised || false,
      adExpiration: property.adExpiration ? property.adExpiration.toISOString() : undefined,
      description: property.description || undefined,
      facilities: property.facilities || [],
      ownerId: property.ownerId,
    }));

    return NextResponse.json({ success: true, properties: formattedProperties }, { status: 200 });
  } catch (error) {
    console.error("Error fetching public properties:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, message: "Failed to fetch properties" }, { status: 500 });
  }
}
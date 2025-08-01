// src/app/api/public-properties/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

interface Property {
  _id: ObjectId;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; quantity: number; deposit: number }[];
  status: "Active" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
  images: string[];
  isAdvertised: boolean;
  adExpiration?: Date;
  description?: string;
  facilities?: string[];
  ownerId: string;
}

interface User {
  _id: ObjectId;
  email: string;
  phone: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  console.log("Handling GET request to /api/public-properties/[id]");

  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      console.log("Invalid property ID", { id });
      return NextResponse.json(
        { success: false, message: "Invalid property ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const propertyObjectId = new ObjectId(id);

    const property = await db
      .collection<Property>("propertyListings")
      .findOne({ _id: propertyObjectId, status: "Active" });

    if (!property) {
      console.log("Property not found or not active", { id });
      return NextResponse.json(
        { success: false, message: "Property not found or not active" },
        { status: 404 }
      );
    }

    const owner = await db
      .collection<User>("propertyOwners")
      .findOne({ _id: new ObjectId(property.ownerId) }, { projection: { email: 1, phone: 1 } });

    const formattedProperty = {
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
    };

    console.log("Property fetched successfully", { id });
    return NextResponse.json({
      success: true,
      property: formattedProperty,
      owner: owner ? { email: owner.email, phone: owner.phone } : null,
    });
  } catch (error) {
    console.error("Error fetching public property:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, message: "Failed to fetch property details" },
      { status: 500 }
    );
  }
}
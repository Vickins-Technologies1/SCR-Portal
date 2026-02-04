// src/app/api/public/properties/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    // Try both common collection names
    let collectionName = "properties";
    let properties = await db.collection(collectionName)
      .find(
        {}, 
        { projection: { _id: 1, name: 1, address: 1, status: 1, ownerId: 1 } }
      )
      .sort({ name: 1 })
      .limit(100)
      .toArray();

    if (properties.length === 0) {
      // fallback to the other name
      collectionName = "propertyListings";
      properties = await db.collection(collectionName)
        .find(
          {}, 
          { projection: { _id: 1, name: 1, address: 1, status: 1, ownerId: 1 } }
        )
        .sort({ name: 1 })
        .limit(100)
        .toArray();
    }

    const formatted = properties.map(p => ({
      id: p._id.toString(),
      name: p.name || "(no name)",
      address: p.address || "",
      status: p.status || "missing",
      ownerId: p.ownerId ? p.ownerId.toString() : "missing"
    }));

    return NextResponse.json({
      success: true,
      usedCollection: collectionName,
      count: properties.length,
      properties: formatted,
      note: "If count is 0 → check if properties exist in MongoDB"
    });
  } catch (error) {
    console.error("Public properties error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load properties",
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
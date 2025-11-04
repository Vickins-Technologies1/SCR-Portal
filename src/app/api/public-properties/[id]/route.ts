// src/app/api/public-properties/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("Fetching property details");

  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const listing = await db
      .collection("propertyListings")
      .findOne({ _id: new ObjectId(id), status: "Active" });

    if (!listing) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const listingId = listing._id.toString();

    // Count tenants for THIS listing only
    const tenants = await db
      .collection("tenants")
      .find({ propertyId: listingId })
      .toArray();

    const occupiedByType = tenants.reduce((acc: any, t) => {
      acc[t.unitType] = (acc[t.unitType] || 0) + 1;
      return acc;
    }, {});

    const unitTypes = (listing.unitTypes || []).map((u: any) => ({
      ...u,
      vacant: Math.max(0, u.quantity - (occupiedByType[u.type] || 0))
    }));

    const owner = await db
      .collection("propertyOwners")
      .findOne(
        { _id: new ObjectId(listing.ownerId) },
        { projection: { email: 1, phone: 1 } }
      );

    const formatted = {
      _id: listingId,
      name: listing.name,
      address: listing.address,
      description: listing.description,
      facilities: listing.facilities || [],
      unitTypes,
      images: listing.images || [],
      isAdvertised: listing.isAdvertised || false,
      adExpiration: listing.adExpiration?.toISOString(),
      status: listing.status,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    };

    return NextResponse.json(
      {
        success: true,
        property: formatted,
        owner: owner ? { email: owner.email, phone: owner.phone } : null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
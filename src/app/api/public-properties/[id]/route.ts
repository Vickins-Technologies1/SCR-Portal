// src/app/api/public-properties/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const summarizeAvailability = (unitTypes: any[]) => {
  const totalUnits = unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  const totalVacant = unitTypes.reduce((sum, unit) => sum + (unit.vacant ?? 0), 0);
  const totalOccupied = Math.max(0, totalUnits - totalVacant);
  const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;
  return { totalUnits, totalVacant, totalOccupied, occupancyRate };
};

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

    const propertyId = listing.originalPropertyId
      ? listing.originalPropertyId.toString()
      : listing._id.toString();

    // Count tenants for the underlying property
    const tenants = await db
      .collection("tenants")
      .find({ propertyId })
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

    const availability = summarizeAvailability(unitTypes);
    const formatted = {
      _id: listing._id.toString(),
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
      availability,
      occupiedByType,
    };

    return NextResponse.json(
      {
        success: true,
        property: formatted,
        owner: owner ? { email: owner.email, phone: owner.phone } : null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

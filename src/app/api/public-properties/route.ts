// src/app/api/public-properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: NextRequest) {
  console.log("Handling GET /api/public-properties");

  try {
    const { searchParams } = new URL(request.url);
    const unitType = searchParams.get("unitType");
    const minPrice = searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : 0;
    const maxPrice = searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : Infinity;
    const location = searchParams.get("location")?.toLowerCase();
    const featured = searchParams.get("featured");

    const { db } = await connectToDatabase();

    // Fetch active listings
    const listings = await db
      .collection("propertyListings")
      .find({ status: "Active" })
      .toArray();

    if (listings.length === 0) {
      return NextResponse.json({ success: true, properties: [] });
    }

    const listingIds = listings.map(l => l._id.toString());

    // Fetch tenants and group by propertyId AND unitType
    const tenantGroups = await db
      .collection("tenants")
      .aggregate([
        {
          $match: {
            propertyId: { $in: listingIds }
          }
        },
        {
          $group: {
            _id: { propertyId: "$propertyId", unitType: "$unitType" },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    // Build map: propertyId → unitType → occupied count
    const occupiedMap = tenantGroups.reduce((acc: Record<string, Record<string, number>>, group: any) => {
      const propId = group._id.propertyId;
      const uType = group._id.unitType;
      if (!acc[propId]) acc[propId] = {};
      acc[propId][uType] = group.count;
      return acc;
    }, {});

    // Fetch owners
    const ownerIds = [...new Set(listings.map(l => l.ownerId))].filter(Boolean);
    const owners = ownerIds.length > 0
      ? await db
          .collection("propertyOwners")
          .find({ _id: { $in: ownerIds.map(id => new ObjectId(id)) } })
          .toArray()
      : [];

    const ownerMap = Object.fromEntries(
      owners.map(o => [o._id.toString(), { email: o.email, phone: o.phone }])
    );

    const enriched = listings
      .map(listing => {
        const listingId = listing._id.toString();
        const occupiedByType = occupiedMap[listingId] || {};

        const unitTypes = (listing.unitTypes || []).map((u: any) => ({
          ...u,
          vacant: Math.max(0, u.quantity - (occupiedByType[u.type] || 0)),
        }));

        const minPriceInListing = Math.min(...unitTypes.map((u: any) => u.price));

        const matchesUnit = !unitType || unitTypes.some((u: any) => u.type === unitType);
        const matchesPrice = minPriceInListing >= minPrice && minPriceInListing <= maxPrice;
        const matchesLocation = !location || listing.address.toLowerCase().includes(location);
        const matchesFeatured = featured === null ||
          (featured === "true" && listing.isAdvertised) ||
          (featured === "false" && !listing.isAdvertised);

        if (!matchesUnit || !matchesPrice || !matchesLocation || !matchesFeatured) {
          return null;
        }

        return {
          _id: listingId,
          name: listing.name,
          address: listing.address,
          description: listing.description,
          facilities: listing.facilities || [],
          unitTypes,
          images: listing.images || [],
          isAdvertised: listing.isAdvertised || false,
          adExpiration: listing.adExpiration?.toISOString(),
          createdAt: listing.createdAt.toISOString(),
          updatedAt: listing.updatedAt.toISOString(),
        };
      })
      .filter(Boolean);

    const sorted = (enriched as any[]).sort((a, b) =>
      a.isAdvertised === b.isAdvertised ? 0 : a.isAdvertised ? -1 : 1
    );

    return NextResponse.json(
      { success: true, properties: sorted },
      {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
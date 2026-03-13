// src/app/api/public-properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const summarizeAvailability = (unitTypes: any[], totalTenants?: number) => {
  const totalUnits = unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);

  if (typeof totalTenants === "number") {
    const normalizedTenants = Math.max(0, totalTenants);
    const totalOccupied = Math.min(totalUnits, normalizedTenants);
    const totalVacant = Math.max(0, totalUnits - totalOccupied);
    const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;
    return { totalUnits, totalVacant, totalOccupied, occupancyRate };
  }

  const totalVacant = unitTypes.reduce((sum, unit) => sum + (unit.vacant ?? 0), 0);
  const totalOccupied = Math.max(0, totalUnits - totalVacant);
  const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;
  return { totalUnits, totalVacant, totalOccupied, occupancyRate };
};

const toISO = (value?: Date | string | null): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
};

const normalizeQuery = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const coerceObjectId = (value: unknown): ObjectId | null => {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  const str = String(value);
  return ObjectId.isValid(str) ? new ObjectId(str) : null;
};

export async function GET(request: NextRequest) {
  console.log("Handling GET /api/public-properties");

  try {
    const { searchParams } = new URL(request.url);
    const unitType = searchParams.get("unitType")?.trim() || "";
    const minPriceParam = searchParams.get("minPrice");
    const maxPriceParam = searchParams.get("maxPrice");
    const hasPriceFilter = minPriceParam !== null || maxPriceParam !== null;
    const minPrice = minPriceParam && Number.isFinite(Number(minPriceParam)) ? Number(minPriceParam) : 0;
    const maxPrice = maxPriceParam && Number.isFinite(Number(maxPriceParam)) ? Number(maxPriceParam) : Infinity;
    const location = normalizeQuery(searchParams.get("location"));
    const featured = normalizeQuery(searchParams.get("featured"));

    const { db } = await connectToDatabase();

    // Fetch active listings
    const listings = await db
      .collection("propertyListings")
      .find({ status: "Active" })
      .toArray();

    if (listings.length === 0) {
      return NextResponse.json({ success: true, properties: [] });
    }

    const propertyIdByListingId = new Map<string, string>();
    const propertyIds = Array.from(
      new Set(
        listings.map((listing) => {
          const listingId = listing._id.toString();
          const propertyId = listing.originalPropertyId
            ? listing.originalPropertyId.toString()
            : listingId;
          propertyIdByListingId.set(listingId, propertyId);
          return propertyId;
        })
      )
    );

    const propertyIdMatch: (string | ObjectId)[] = [...propertyIds];
    propertyIds.forEach((id) => {
      if (ObjectId.isValid(id)) {
        propertyIdMatch.push(new ObjectId(id));
      }
    });

    // Fetch tenants and group by propertyId AND unitType
    const tenantGroups = await db
      .collection("tenants")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIdMatch }
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
      const propId = group._id.propertyId.toString(); // ensure string key
      const uType = group._id.unitType;
      if (!acc[propId]) acc[propId] = {};
      acc[propId][uType] = group.count;
      return acc;
    }, {});

    const totalTenantsByProperty = tenantGroups.reduce((acc: Record<string, number>, group: any) => {
      const propId = group._id.propertyId.toString(); // ensure string key
      acc[propId] = (acc[propId] || 0) + group.count;
      return acc;
    }, {});

    // Fetch owners
    const ownerIds = [...new Set(listings.map((l) => l.ownerId))].filter(Boolean);
    const ownerObjectIds = ownerIds
      .map((id) => coerceObjectId(id))
      .filter((id): id is ObjectId => Boolean(id));
    const owners = ownerObjectIds.length > 0
      ? await db
          .collection("propertyOwners")
          .find({ _id: { $in: ownerObjectIds } })
          .toArray()
      : [];

    const ownerMap = Object.fromEntries(
      owners.map((o) => [o._id.toString(), { email: o.email, phone: o.phone }])
    );

    const enriched = listings
      .map((listing) => {
        const listingId = listing._id.toString();
        const propertyId = propertyIdByListingId.get(listingId) || listingId;
        const occupiedByType = occupiedMap[propertyId] || {};

        const unitTypes = (listing.unitTypes || []).map((u: any) => ({
          ...u,
          vacant: Math.max(0, (u.quantity || 0) - (occupiedByType[u.type] || 0)),
        }));

        const totalTenants = totalTenantsByProperty[propertyId] || 0;
        const availability = summarizeAvailability(unitTypes, totalTenants);

        const prices = unitTypes
          .map((u: any) => (typeof u.price === "number" ? u.price : Number(u.price)))
          .filter((price: number) => Number.isFinite(price));
        const minPriceInListing = prices.length ? Math.min(...prices) : null;

        const matchesUnit = !unitType || unitTypes.some((u: any) => u.type === unitType);
const matchesPrice = hasPriceFilter ? minPriceInListing !== null && minPriceInListing >= minPrice && minPriceInListing <= maxPrice : true;

        const listingAddress = typeof listing.address === "string" ? listing.address.toLowerCase() : "";
        const listingName = typeof listing.name === "string" ? listing.name.toLowerCase() : "";
        const matchesLocation = !location || listingAddress.includes(location) || listingName.includes(location);

        const matchesFeatured =
          !featured ||
          featured === "all" ||
          ((featured === "true" || featured === "featured") && listing.isAdvertised) ||
          ((featured === "false" || featured === "standard") && !listing.isAdvertised);

        if (!matchesUnit || !matchesPrice || !matchesLocation || !matchesFeatured) {
          return null;
        }

        const ownerIdValue = listing.ownerId ? String(listing.ownerId) : "";

        return {
          _id: listingId,
          originalPropertyId: listing.originalPropertyId?.toString() || listingId,
          ownerId: ownerIdValue,
          name: listing.name,
          address: listing.address,
          description: listing.description,
          facilities: listing.facilities || [],
          unitTypes,
          images: listing.images || [],
          isAdvertised: listing.isAdvertised || false,
          adExpiration: toISO(listing.adExpiration),
          status: listing.status,
          createdAt: toISO(listing.createdAt) || "",
          updatedAt: toISO(listing.updatedAt),
          availability,
          owner: ownerMap[ownerIdValue] || null,
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
        headers: { "Cache-Control": "no-store" },
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
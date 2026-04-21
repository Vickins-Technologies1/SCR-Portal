// app/api/public-properties/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getReviewSummaryForListing } from "@/lib/property-reviews";
import { pickListingContactPhone } from "@/lib/listing-contact";

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

const isValidHexId = (id: string): boolean => {
  return typeof id === "string" && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
};

const buildTenantMatch = (propertyId: string) => {
  const matches: (string | ObjectId)[] = [propertyId];
  if (isValidHexId(propertyId)) {
    matches.push(new ObjectId(propertyId));
  }
  return { propertyId: { $in: matches } };
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  console.log("Fetching property details for ID:", id);

  try {
    if (!id) {
      console.log("Missing property ID");
      return NextResponse.json(
        { success: false, message: "Missing property ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Primary lookup – ObjectId when possible
    let listing = null;
    if (isValidHexId(id)) {
      listing = await db.collection("propertyListings").findOne({
        _id: new ObjectId(id),
        status: "Active",
      });
    }

    // Fallback – handle legacy string _id values
    if (!listing) {
      console.log(`No ObjectId match for ${id} — trying string fallback`);
      listing = await db.collection("propertyListings").findOne({
        _id: id,
        status: "Active",
      } as any);
    }

    if (!listing) {
      // Fallback: check Airbnb listings
      let airbnbListing: any = null;
      if (isValidHexId(id)) {
        airbnbListing = await db.collection("airbnbListings").findOne({
          _id: new ObjectId(id),
          status: { $in: ["published", "active"] },
        });
      }
      if (!airbnbListing) {
        airbnbListing = await db.collection("airbnbListings").findOne({
          externalId: id,
          status: { $in: ["published", "active"] },
        } as any);
      }

      if (!airbnbListing) {
        console.log("Property not found for ID:", id);
        return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      }

      const ownerIdValue = airbnbListing.ownerId ? String(airbnbListing.ownerId) : "";
      const owner = ownerIdValue && isValidHexId(ownerIdValue)
        ? await db
            .collection("propertyOwners")
            .findOne(
              { _id: new ObjectId(ownerIdValue) },
              { projection: { email: 1, phone: 1 } }
            )
        : null;
      const listingContactPhone = pickListingContactPhone(airbnbListing);

      const formatted = {
        _id: airbnbListing.externalId || airbnbListing._id?.toString?.() || "",
        ownerId: ownerIdValue,
        listingType: "airbnb",
        name: airbnbListing.name || "Airbnb Listing",
        address: airbnbListing.location || airbnbListing.address || "Kenya",
        description: airbnbListing.description || airbnbListing.summary || "",
        amenities: airbnbListing.amenities || [],
        houseRules: airbnbListing.houseRules || [],
        images: airbnbListing.images || [],
        status: airbnbListing.status || "draft",
        baseRate: Number(airbnbListing.baseRate || 0),
        weekendRate: Number(airbnbListing.weekendRate || airbnbListing.baseRate || 0),
        occupancyRate: Number(airbnbListing.occupancyRate || 0),
        rating: Number(airbnbListing.rating || 0),
        reviewCount: Number(airbnbListing.reviewCount || 0),
        units: Number(airbnbListing.units || 1),
        licenseStatus: airbnbListing.licenseStatus || "missing",
        createdAt: toISO(airbnbListing.createdAt) || "",
        updatedAt: toISO(airbnbListing.updatedAt),
      };

      const reviewSummary = await getReviewSummaryForListing(db, formatted._id);
      if (reviewSummary.reviewCount > 0) {
        formatted.rating = reviewSummary.rating;
        formatted.reviewCount = reviewSummary.reviewCount;
      }

      return NextResponse.json(
        {
          success: true,
          property: formatted,
          owner: owner || listingContactPhone
            ? { email: owner?.email, phone: listingContactPhone ?? owner?.phone }
            : null,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const propertyId = listing.originalPropertyId
      ? String(listing.originalPropertyId)
      : String(listing._id);

    const tenants = await db
      .collection("tenants")
      .find(buildTenantMatch(propertyId))
      .toArray();

    const occupiedByType = tenants.reduce((acc: Record<string, number>, t: any) => {
      const type = t.unitType || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const unitTypes = (listing.unitTypes || []).map((u: any) => ({
      ...u,
      vacant: Math.max(0, (u.quantity || 0) - (occupiedByType[u.type] || 0)),
    }));

    const ownerIdValue = listing.ownerId ? String(listing.ownerId) : "";
    const owner = ownerIdValue && isValidHexId(ownerIdValue)
      ? await db
          .collection("propertyOwners")
          .findOne(
            { _id: new ObjectId(ownerIdValue) },
            { projection: { email: 1, phone: 1 } }
          )
      : null;
    const listingContactPhone = pickListingContactPhone(listing);

    const availability = summarizeAvailability(unitTypes, tenants.length);

    const formatted = {
      _id: String(listing._id),
      originalPropertyId: listing.originalPropertyId
        ? String(listing.originalPropertyId)
        : String(listing._id),
      ownerId: ownerIdValue,
      listingType: "rentals",
      name: listing.name,
      address: listing.address,
      description: listing.description,
      facilities: listing.facilities || [],
      unitTypes,
      images: listing.images || [],
      isAdvertised: !!listing.isAdvertised,
      adExpiration: toISO(listing.adExpiration),
      status: listing.status,
      createdAt: toISO(listing.createdAt) || "",
      updatedAt: toISO(listing.updatedAt),
      availability,
      occupiedByType,
      rating: 0,
      reviewCount: 0,
    };

    const reviewSummary = await getReviewSummaryForListing(db, formatted._id);
    formatted.rating = reviewSummary.rating;
    formatted.reviewCount = reviewSummary.reviewCount;

    return NextResponse.json(
      {
        success: true,
        property: formatted,
        owner: owner || listingContactPhone
          ? { email: owner?.email, phone: listingContactPhone ?? owner?.phone }
          : null,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Error fetching property:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}




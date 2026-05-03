// src/app/api/public-properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getReviewSummaryForListings } from "@/lib/property-reviews";
import { pickListingContactPhone } from "@/lib/listing-contact";
import { getOccupancyByPropertyAndUnitType } from "@/lib/tenant-occupancy";

const summarizeAvailability = (unitTypes: any[], occupiedUnits?: number) => {
  const totalUnits = unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);

  if (typeof occupiedUnits === "number") {
    const normalizedOccupied = Math.max(0, occupiedUnits);
    const totalOccupied = Math.min(totalUnits, normalizedOccupied);
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

    // Fetch active long-term listings
    const listings = await db
      .collection("propertyListings")
      .find({ status: "Active" })
      .toArray();

    // Fetch published Airbnb listings
    const airbnbListings = await db
      .collection("airbnbListings")
      .find({ status: { $in: ["published", "active"] } })
      .toArray();

    // Fetch published for-sale listings (admin-managed)
    const saleListings = await db
      .collection("marketplaceSaleListings")
      .find({ status: { $in: ["published"] } })
      .toArray();

    if (listings.length === 0 && airbnbListings.length === 0 && saleListings.length === 0) {
      return NextResponse.json({ success: true, properties: [] });
    }

    const rentalListingIds = listings.map((listing) => listing._id.toString());
    const airbnbListingIds = airbnbListings
      .map((listing) => listing.externalId || listing._id?.toString?.() || "")
      .filter(Boolean);
    const saleListingIds = saleListings.map((listing) => listing._id?.toString?.() || "").filter(Boolean);
    const reviewSummaryMap = await getReviewSummaryForListings(
      db,
      Array.from(new Set([...rentalListingIds, ...airbnbListingIds, ...saleListingIds]))
    );

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

    const occupancyByProperty = await getOccupancyByPropertyAndUnitType(db, propertyIds, new Date());

    // Fetch owners (long-term + Airbnb)
    const ownerIds = [
      ...new Set([
        ...listings.map((l) => l.ownerId),
        ...airbnbListings.map((l) => l.ownerId),
        ...saleListings.map((l) => l.ownerId),
      ]),
    ].filter(Boolean);
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
        const occupancy = occupancyByProperty[propertyId] || { totalTenants: 0, occupiedUnits: 0, occupiedByType: {} };
        const occupiedByType = occupancy.occupiedByType || {};

        const unitTypes = (listing.unitTypes || []).map((u: any) => ({
          ...u,
          vacant: Math.max(0, (u.quantity || 0) - (occupiedByType[u.type] || 0)),
        }));

        const availability = summarizeAvailability(unitTypes, occupancy.occupiedUnits);

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
        const listingContactPhone = pickListingContactPhone(listing);
        const ownerFromAccount = ownerMap[ownerIdValue] || null;
        const owner =
          ownerFromAccount || listingContactPhone
            ? {
                email: ownerFromAccount?.email,
                phone: listingContactPhone ?? ownerFromAccount?.phone,
              }
            : null;
        const reviewSummary = reviewSummaryMap.get(listingId);
        const rating = reviewSummary?.rating ?? 0;
        const reviewCount = reviewSummary?.reviewCount ?? 0;

        return {
          _id: listingId,
          originalPropertyId: listing.originalPropertyId?.toString() || listingId,
          ownerId: ownerIdValue,
          listingType: "rentals",
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
          rating,
          reviewCount,
          owner,
        };
      })
      .filter(Boolean);

    const airbnbEnriched = airbnbListings
      .map((listing) => {
        const listingId = listing.externalId || listing._id?.toString?.() || "";
        const name = listing.name || "Airbnb Listing";
        const address = listing.location || listing.address || "Kenya";
        const reviewSummary = reviewSummaryMap.get(listingId);
        const reviewRating = reviewSummary?.rating ?? 0;
        const reviewCount = reviewSummary?.reviewCount ?? 0;
        const fallbackRating = Number(listing.rating || 0);
        const fallbackReviewCount = Number(listing.reviewCount || 0);
        const rating = reviewCount > 0 ? reviewRating : fallbackRating;
        const totalReviews = reviewCount > 0 ? reviewCount : fallbackReviewCount;

        const minRate = Number(listing.baseRate || 0);
        const matchesPrice = hasPriceFilter
          ? Number.isFinite(minRate) && minRate >= minPrice && minRate <= maxPrice
          : true;

        const listingAddress = typeof address === "string" ? address.toLowerCase() : "";
        const listingName = typeof name === "string" ? name.toLowerCase() : "";
        const matchesLocation = !location || listingAddress.includes(location) || listingName.includes(location);

        const featuredScore = rating;
        const featuredReviews = totalReviews;
        const isFeatured = featuredScore >= 4.6 && featuredReviews >= 8;
        const matchesFeatured =
          !featured ||
          featured === "all" ||
          ((featured === "true" || featured === "featured") && isFeatured) ||
          ((featured === "false" || featured === "standard") && !isFeatured);

        if (!matchesPrice || !matchesLocation || !matchesFeatured) {
          return null;
        }

        const ownerIdValue = listing.ownerId ? String(listing.ownerId) : "";
        const listingContactPhone = pickListingContactPhone(listing);
        const ownerFromAccount = ownerMap[ownerIdValue] || null;
        const owner =
          ownerFromAccount || listingContactPhone
            ? {
                email: ownerFromAccount?.email,
                phone: listingContactPhone ?? ownerFromAccount?.phone,
              }
            : null;

        return {
          _id: listingId,
          ownerId: ownerIdValue,
          listingType: "airbnb",
          name,
          address,
          description: listing.description || listing.summary || "",
          amenities: listing.amenities || [],
          houseRules: listing.houseRules || [],
          images: listing.images || [],
          status: listing.status || "draft",
          baseRate: Number(listing.baseRate || 0),
          weekendRate: Number(listing.weekendRate || listing.baseRate || 0),
          occupancyRate: Number(listing.occupancyRate || 0),
          rating,
          reviewCount: totalReviews,
          units: Number(listing.units || 1),
          licenseStatus: listing.licenseStatus || "missing",
          createdAt: toISO(listing.createdAt) || "",
          updatedAt: toISO(listing.updatedAt),
          owner,
        };
      })
      .filter(Boolean);

    const saleEnriched = saleListings
      .map((listing) => {
        const listingId = listing._id?.toString?.() || "";
        if (!listingId) return null;

        const name = listing.name || "Property for Sale";
        const address = listing.address || "Kenya";
        const price = Number(listing.price || 0);

        const matchesPrice = hasPriceFilter
          ? Number.isFinite(price) && price >= minPrice && price <= maxPrice
          : true;

        const listingAddress = typeof address === "string" ? address.toLowerCase() : "";
        const listingName = typeof name === "string" ? name.toLowerCase() : "";
        const matchesLocation = !location || listingAddress.includes(location) || listingName.includes(location);

        const isFeatured = !!listing.isFeatured;
        const matchesFeatured =
          !featured ||
          featured === "all" ||
          ((featured === "true" || featured === "featured") && isFeatured) ||
          ((featured === "false" || featured === "standard") && !isFeatured);

        if (!matchesPrice || !matchesLocation || !matchesFeatured) {
          return null;
        }

        const ownerIdValue = listing.ownerId ? String(listing.ownerId) : "";
        const listingContactPhone = pickListingContactPhone(listing);
        const ownerFromAccount = ownerMap[ownerIdValue] || null;
        const owner =
          ownerFromAccount || listingContactPhone || listing.contactEmail
            ? {
                email: listing.contactEmail ?? ownerFromAccount?.email,
                phone: listingContactPhone ?? ownerFromAccount?.phone,
              }
            : null;

        const reviewSummary = reviewSummaryMap.get(listingId);
        const rating = reviewSummary?.rating ?? 0;
        const reviewCount = reviewSummary?.reviewCount ?? 0;

        return {
          _id: listingId,
          ownerId: ownerIdValue,
          listingType: "sale",
          name,
          address,
          description: listing.description || "",
          propertyType: listing.propertyType || "",
          bedrooms: Number.isFinite(Number(listing.bedrooms)) ? Number(listing.bedrooms) : undefined,
          bathrooms: Number.isFinite(Number(listing.bathrooms)) ? Number(listing.bathrooms) : undefined,
          interiorSizeSqft: Number.isFinite(Number(listing.interiorSizeSqft))
            ? Number(listing.interiorSizeSqft)
            : undefined,
          lotSizeSqft: Number.isFinite(Number(listing.lotSizeSqft)) ? Number(listing.lotSizeSqft) : undefined,
          yearBuilt: Number.isFinite(Number(listing.yearBuilt)) ? Number(listing.yearBuilt) : undefined,
          price,
          currency: listing.currency || "Ksh",
          amenities: listing.amenities || [],
          images: listing.images || [],
          status: listing.status || "draft",
          createdAt: toISO(listing.createdAt) || "",
          updatedAt: toISO(listing.updatedAt),
          isFeatured,
          rating,
          reviewCount,
          owner,
        };
      })
      .filter(Boolean);

    const isFeaturedListing = (listing: any): boolean => {
      if (!listing) return false;
      if (listing.listingType === "rentals") return !!listing.isAdvertised;
      if (listing.listingType === "sale") return !!listing.isFeatured;
      if (listing.listingType === "airbnb") {
        const rating = Number(listing.rating || 0);
        const reviewCount = Number(listing.reviewCount || 0);
        return rating >= 4.6 && reviewCount >= 8;
      }
      return false;
    };

    const sorted = [...(enriched as any[]), ...(airbnbEnriched as any[]), ...(saleEnriched as any[])].sort(
      (a, b) => Number(isFeaturedListing(b)) - Number(isFeaturedListing(a))
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

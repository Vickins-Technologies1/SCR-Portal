import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { ensureAirbnbSeed } from "@/lib/airbnb-seed";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  await ensureAirbnbSeed(db, ownerId);

  const listings = await db
    .collection("airbnbListings")
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    success: true,
    listings: listings.map((listing) => ({
      id: listing.externalId || listing._id?.toString?.() || "",
      name: listing.name,
      location: listing.location,
      status: listing.status,
      units: listing.units,
      baseRate: listing.baseRate,
      weekendRate: listing.weekendRate,
      occupancyRate: listing.occupancyRate ?? 0,
      rating: listing.rating ?? 0,
      reviewCount: listing.reviewCount ?? 0,
      lastSyncedAt: listing.lastSyncedAt || listing.updatedAt || listing.createdAt,
      amenities: listing.amenities || [],
      houseRules: listing.houseRules || [],
      licenseStatus: listing.licenseStatus || "missing",
    })),
  });
}

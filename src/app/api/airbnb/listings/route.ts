import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

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

const ListingSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2),
  location: z.string().trim().min(2),
  status: z.enum(["draft", "published", "paused"]).optional(),
  units: z.preprocess((value) => Number(value), z.number().int().min(1).max(200)),
  baseRate: z.preprocess((value) => Number(value), z.number().nonnegative()),
  weekendRate: z.preprocess((value) => Number(value), z.number().nonnegative()),
  amenities: z.array(z.string().trim().min(1)).optional(),
  houseRules: z.array(z.string().trim().min(1)).optional(),
  licenseStatus: z.enum(["valid", "due", "missing"]).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ListingSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid listing payload" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const externalId = `lst-${new ObjectId().toString()}`;

  const listingDoc = {
    ownerId,
    externalId,
    name: parsed.data.name,
    location: parsed.data.location,
    status: parsed.data.status || "draft",
    units: parsed.data.units,
    baseRate: parsed.data.baseRate,
    weekendRate: parsed.data.weekendRate,
    occupancyRate: 0,
    rating: 0,
    reviewCount: 0,
    amenities: parsed.data.amenities || [],
    houseRules: parsed.data.houseRules || [],
    licenseStatus: parsed.data.licenseStatus || "missing",
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const { db } = await connectToDatabase();
  await db.collection("airbnbListings").insertOne(listingDoc);

  return NextResponse.json({
    success: true,
    listing: {
      id: externalId,
      name: listingDoc.name,
      location: listingDoc.location,
      status: listingDoc.status,
      units: listingDoc.units,
      baseRate: listingDoc.baseRate,
      weekendRate: listingDoc.weekendRate,
      occupancyRate: listingDoc.occupancyRate,
      rating: listingDoc.rating,
      reviewCount: listingDoc.reviewCount,
      lastSyncedAt: listingDoc.lastSyncedAt || listingDoc.updatedAt,
      amenities: listingDoc.amenities,
      houseRules: listingDoc.houseRules,
      licenseStatus: listingDoc.licenseStatus,
    },
  });
}

export async function PUT(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ListingSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ success: false, message: "Invalid listing payload" }, { status: 400 });
  }

  const listingId = parsed.data.id;
  const filter = ObjectId.isValid(listingId)
    ? { _id: new ObjectId(listingId), ownerId }
    : { externalId: listingId, ownerId };

  const update = {
    name: parsed.data.name,
    location: parsed.data.location,
    status: parsed.data.status || "draft",
    units: parsed.data.units,
    baseRate: parsed.data.baseRate,
    weekendRate: parsed.data.weekendRate,
    amenities: parsed.data.amenities || [],
    houseRules: parsed.data.houseRules || [],
    licenseStatus: parsed.data.licenseStatus || "missing",
    updatedAt: new Date().toISOString(),
  };

  const { db } = await connectToDatabase();
  const result = await db.collection("airbnbListings").findOneAndUpdate(
    filter,
    { $set: update },
    { returnDocument: "after" }
  );

  const updated = result?.value;

  if (!updated) {
    return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    listing: {
      id: updated.externalId || updated._id?.toString?.() || "",
      name: updated.name,
      location: updated.location,
      status: updated.status,
      units: updated.units,
      baseRate: updated.baseRate,
      weekendRate: updated.weekendRate,
      occupancyRate: updated.occupancyRate ?? 0,
      rating: updated.rating ?? 0,
      reviewCount: updated.reviewCount ?? 0,
      lastSyncedAt: updated.lastSyncedAt || updated.updatedAt || updated.createdAt,
      amenities: updated.amenities || [],
      houseRules: updated.houseRules || [],
      licenseStatus: updated.licenseStatus || "missing",
    },
  });
}

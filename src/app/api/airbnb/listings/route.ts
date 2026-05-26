import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { buildListingIdFilter, normalizeListingStatus } from "@/lib/airbnb-listings";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOwnerId = searchParams.get("ownerId");

    const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
    if (resolved.response) return resolved.response;
    const { ownerId, role, userId } = resolved.context!;

    const { db } = await connectToDatabase();

    let assignedListingIds: string[] | null = null;
    if (role === "teamMember" && userId && ObjectId.isValid(userId)) {
      const member = await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), active: true });
      assignedListingIds = Array.isArray((member as any)?.assignedAirbnbListingIds)
        ? Array.from(
            new Set(
              (member as any).assignedAirbnbListingIds
                .map((value: any) => String(value || "").trim())
                .filter((value: string) => value.length > 0)
            )
          )
        : null;
    }

    const listings = await db
      .collection("airbnbListings")
      .find({
        ownerId,
        ...(assignedListingIds && assignedListingIds.length > 0 ? { externalId: { $in: assignedListingIds } } : {}),
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      listings: listings.map((listing) => ({
        id: listing.externalId || listing._id?.toString?.() || "",
        name: listing.name,
        location: listing.location,
        contactPhone: listing.contactPhone || undefined,
        status: normalizeListingStatus(listing.status),
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
        description: listing.description || "",
        images: listing.images || [],
      })),
    });
  } catch (error) {
    logger.error("Airbnb listings GET error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

const ListingSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2),
  location: z.string().trim().min(2),
  contactPhone: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }, z.string().min(7).max(30).optional()),
  status: z
    .preprocess((value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim().toLowerCase();
      return normalized === "active" ? "published" : normalized;
    }, z.enum(["draft", "published", "paused"]))
    .optional(),
  units: z.preprocess((value) => Number(value), z.number().int().min(1).max(200)),
  baseRate: z.preprocess((value) => Number(value), z.number().nonnegative()),
  weekendRate: z.preprocess((value) => Number(value), z.number().nonnegative()),
  amenities: z.array(z.string().trim().min(1)).optional(),
  houseRules: z.array(z.string().trim().min(1)).optional(),
  licenseStatus: z.enum(["valid", "due", "missing"]).optional(),
  description: z.string().trim().max(2000).optional(),
  images: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .refine((value) => !value.startsWith("blob:"), "Invalid image URL")
    )
    .max(10)
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json(
        { success: false, message: "Invalid listing payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const externalId = `lst-${new ObjectId().toString()}`;

    const listingDoc = {
      ownerId,
      externalId,
      name: parsed.data.name,
      location: parsed.data.location,
      contactPhone: parsed.data.contactPhone ?? null,
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
      description: parsed.data.description || "",
      images: parsed.data.images || [],
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
        contactPhone: listingDoc.contactPhone || undefined,
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
        description: listingDoc.description,
        images: listingDoc.images,
      },
    });
  } catch (error) {
    logger.error("Airbnb listings POST error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
      return NextResponse.json(
        {
          success: false,
          message: "Invalid listing payload",
          ...(parsed.success ? {} : { errors: parsed.error.flatten() }),
        },
        { status: 400 }
      );
    }

    const listingId = parsed.data.id;
    const filter = buildListingIdFilter(ownerId, listingId);

    const update = {
      name: parsed.data.name,
      location: parsed.data.location,
      contactPhone: parsed.data.contactPhone ?? null,
      status: parsed.data.status || "draft",
      units: parsed.data.units,
      baseRate: parsed.data.baseRate,
      weekendRate: parsed.data.weekendRate,
      amenities: parsed.data.amenities || [],
      houseRules: parsed.data.houseRules || [],
      licenseStatus: parsed.data.licenseStatus || "missing",
      description: parsed.data.description || "",
      images: parsed.data.images || [],
      updatedAt: new Date().toISOString(),
    };

    const { db } = await connectToDatabase();
    const result = await db.collection("airbnbListings").findOneAndUpdate(
      filter,
      { $set: update },
      { returnDocument: "after" }
    );

    // MongoDB Node driver v6 defaults `includeResultMetadata` to false, so the findOneAnd* family
    // returns the matched document (or null) instead of a ModifyResult with a `.value` property.
    const updated = (result as any)?.value ?? result;

    if (!updated) {
      return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      listing: {
        id: updated.externalId || updated._id?.toString?.() || "",
        name: updated.name,
        location: updated.location,
        contactPhone: updated.contactPhone || undefined,
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
        description: updated.description || "",
        images: updated.images || [],
      },
    });
  } catch (error) {
    logger.error("Airbnb listings PUT error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(request, csrfToken)) {
      return buildInvalidCsrfResponse(request);
    }

    const resolved = await resolveAirbnbOwner(request, null);
    if (resolved.response) return resolved.response;
    const { ownerId } = resolved.context!;

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ success: false, message: "Listing ID is required" }, { status: 400 });
    }

    const filter = buildListingIdFilter(ownerId, listingId);

    const { db, client } = await connectToDatabase();

    const session = client.startSession();
    try {
      let deletedListing: any = null;
      let deletedBookings = 0;
      let deletedPayments = 0;
      let deletedTenants = 0;

       await session.withTransaction(async () => {
        const listingRes = await db.collection("airbnbListings").findOneAndDelete(filter, { session });
        deletedListing = (listingRes as any)?.value ?? listingRes;
        if (!deletedListing) {
          return;
        }

        const canonicalListingId =
          deletedListing.externalId || deletedListing._id?.toString?.() || listingId;
        const listingName = String(deletedListing.name || deletedListing.listingName || "").trim();

        const bookingDocs = await db
          .collection("airbnbBookings")
          .find(
            {
              ownerId,
              $or: [
                { listingId: canonicalListingId },
                ...(listingName ? [{ listingName }] : []),
              ],
            },
            { projection: { externalId: 1, _id: 1 }, session }
          )
          .toArray();

        const bookingIds = bookingDocs
          .map((b: any) => b.externalId || b._id?.toString?.() || "")
          .filter((id: string) => Boolean(id));

        const bookingsRes = await db.collection("airbnbBookings").deleteMany(
          {
            ownerId,
            $or: [
              { listingId: canonicalListingId },
              ...(listingName ? [{ listingName }] : []),
            ],
          },
          { session }
        );
        deletedBookings = bookingsRes.deletedCount;

        if (bookingIds.length > 0) {
          const paymentsRes = await db.collection("payments").deleteMany(
            {
              ownerId,
              type: "AirbnbDirect",
              $or: [{ airbnbBookingId: { $in: bookingIds } }, { propertyId: canonicalListingId }],
            },
            { session }
          );
          deletedPayments += paymentsRes.deletedCount;
        } else {
          const paymentsRes = await db.collection("payments").deleteMany(
            { ownerId, type: "AirbnbDirect", propertyId: canonicalListingId },
            { session }
          );
          deletedPayments += paymentsRes.deletedCount;
        }

        const tenantsRes = await db.collection("tenants").deleteMany(
          {
            ownerId,
            accountType: "airbnb_guest",
            $or: [
              { propertyId: canonicalListingId },
              ...(bookingIds.length > 0 ? [{ airbnbBookingId: { $in: bookingIds } }] : []),
              ...(listingName ? [{ houseNumber: listingName }] : []),
            ],
          },
          { session }
        );
        deletedTenants = tenantsRes.deletedCount;

        await db.collection("airbnbCalendar").deleteMany(
          {
            ownerId,
            $or: [
              { listingId: canonicalListingId },
              { externalListingId: canonicalListingId },
              ...(listingName ? [{ listingName }] : []),
            ],
          },
          { session }
        );

        await db.collection("airbnbComplianceDocuments").deleteMany(
          { ownerId, $or: [{ propertyId: canonicalListingId }, ...(listingName ? [{ propertyName: listingName }] : [])] },
          { session }
        );

        await db.collection("airbnbCompliance").deleteMany(
          { ownerId, $or: [{ externalId: canonicalListingId }, ...(listingName ? [{ propertyName: listingName }] : [])] },
          { session }
        );

        if (listingName) {
          await db.collection("airbnbTasks").deleteMany(
            { ownerId, propertyName: listingName },
            { session }
          );
        }

        if (listingName) {
          const convos = await db
            .collection("airbnbConversations")
            .find({ ownerId, listingName }, { projection: { externalId: 1, _id: 1 }, session })
            .toArray();
          const conversationIds = convos
            .map((c: any) => c.externalId || c._id?.toString?.() || "")
            .filter((id: string) => Boolean(id));

          await db.collection("airbnbConversations").deleteMany({ ownerId, listingName }, { session });

          if (conversationIds.length > 0) {
            await db.collection("airbnbConversationMessages").deleteMany(
              { ownerId, conversationId: { $in: conversationIds } },
              { session }
            );
            await db.collection("airbnbMessageDeliveries").deleteMany(
              { ownerId, conversationId: { $in: conversationIds } },
              { session }
            );
          }
        }
      });

      if (!deletedListing) {
        return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        deletedBookings,
        deletedPayments,
        deletedTenants,
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    logger.error("Airbnb listings DELETE error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

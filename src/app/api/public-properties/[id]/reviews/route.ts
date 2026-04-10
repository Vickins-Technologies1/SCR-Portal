import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  getReviewSummaryForListing,
  getReviewsForListing,
  REVIEW_COLLECTION,
  type ListingType,
} from "@/lib/property-reviews";

const isValidHexId = (id: string): boolean =>
  typeof id === "string" && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);

const normalizeText = (value: string, maxLength: number) =>
  value.trim().replace(/\s+/g, " ").slice(0, maxLength);

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const MIN_FORM_TIME_MS = 500;
const MAX_FORM_TIME_MS = 1000 * 60 * 60 * 24;

const getClientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const resolveListing = async (db: any, id: string) => {
  if (!id) return null;

  let rentalListing = null;
  if (isValidHexId(id)) {
    rentalListing = await db.collection("propertyListings").findOne({
      _id: new ObjectId(id),
      status: "Active",
    });
  }
  if (!rentalListing) {
    rentalListing = await db.collection("propertyListings").findOne({
      _id: id,
      status: "Active",
    } as any);
  }
  if (rentalListing) {
    return {
      listingId: rentalListing._id.toString(),
      listingType: "rentals" as ListingType,
      name: rentalListing.name || "Property",
    };
  }

  let airbnbListing = null;
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
  if (!airbnbListing) return null;

  return {
    listingId: airbnbListing.externalId || airbnbListing._id?.toString?.() || id,
    listingType: "airbnb" as ListingType,
    name: airbnbListing.name || "Airbnb Listing",
  };
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const limitParam = new URL(req.url).searchParams.get("limit");
    const limit = limitParam && Number.isFinite(Number(limitParam)) ? Number(limitParam) : 12;

    const { db } = await connectToDatabase();
    const listing = await resolveListing(db, id);
    const listingId = listing?.listingId || id;

    const reviews = await getReviewsForListing(db, listingId, Math.min(50, Math.max(1, limit)));
    const summary = await getReviewSummaryForListing(db, listingId);

    return NextResponse.json(
      { success: true, reviews, rating: summary.rating, reviewCount: summary.reviewCount },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load reviews." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const payload = await req.json();
    const rawName = typeof payload.reviewerName === "string" ? payload.reviewerName : payload.name;
    const rawEmail = typeof payload.reviewerEmail === "string" ? payload.reviewerEmail : payload.email;
    const rawReview = typeof payload.review === "string" ? payload.review : "";
    const ratingValue = Number(payload.rating);

    const reviewerName = normalizeText(rawName || "", 60);
    const reviewerEmail = rawEmail ? normalizeText(rawEmail, 120) : "";
    const review = normalizeText(rawReview || "", 1000);

    if (!reviewerName || reviewerName.length < 2) {
      return NextResponse.json(
        { success: false, message: "Please provide your name." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return NextResponse.json(
        { success: false, message: "Rating must be between 1 and 5." },
        { status: 400 }
      );
    }

    if (!review || review.length < 10) {
      return NextResponse.json(
        { success: false, message: "Please add a short review (10+ characters)." },
        { status: 400 }
      );
    }

    if (reviewerEmail && !isValidEmail(reviewerEmail)) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const now = new Date();
    const nowMs = now.getTime();
    const honeypot = typeof payload.company === "string" ? payload.company : "";
    if (honeypot.trim().length > 0) {
      return NextResponse.json(
        { success: false, message: "Unable to submit your review." },
        { status: 400 }
      );
    }

    const startedAt = Number(payload.formStartedAt);
    if (Number.isFinite(startedAt) && startedAt > 0) {
      const elapsedMs = nowMs - startedAt;
      if (
        !Number.isFinite(elapsedMs) ||
        elapsedMs < MIN_FORM_TIME_MS ||
        elapsedMs > MAX_FORM_TIME_MS
      ) {
        return NextResponse.json(
          { success: false, message: "Unable to submit your review." },
          { status: 400 }
        );
      }
    }

    const { db } = await connectToDatabase();
    const listing = await resolveListing(db, id);
    if (!listing) {
      return NextResponse.json(
        { success: false, message: "Property not found." },
        { status: 404 }
      );
    }

    const ipAddress = getClientIp(req);
    const hasIp = ipAddress !== "unknown";
    const userAgent = req.headers.get("user-agent") || "";
    if (hasIp) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const recentCount = await db.collection(REVIEW_COLLECTION).countDocuments({
        ipAddress,
        createdAt: { $gte: oneHourAgo },
      });

      if (recentCount >= 5) {
        return NextResponse.json(
          { success: false, message: "Too many reviews from this device. Try again later." },
          { status: 429 }
        );
      }

      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      const recentListingCount = await db.collection(REVIEW_COLLECTION).countDocuments({
        ipAddress,
        listingId: listing.listingId,
        createdAt: { $gte: twoMinutesAgo },
      });

      if (recentListingCount > 0) {
        return NextResponse.json(
          { success: false, message: "Please wait a bit before submitting another review." },
          { status: 429 }
        );
      }
    }

    const reviewDoc = {
      listingId: listing.listingId,
      listingType: listing.listingType,
      propertyName: listing.name,
      reviewerName,
      reviewerEmail: reviewerEmail || null,
      rating: ratingValue,
      review,
      status: "pending",
      ipAddress,
      userAgent,
      createdAt: now,
    };

    const result = await db.collection(REVIEW_COLLECTION).insertOne(reviewDoc);
    const summary = await getReviewSummaryForListing(db, listing.listingId);

    return NextResponse.json(
      {
        success: true,
        review: {
          _id: result.insertedId.toString(),
          listingId: listing.listingId,
          listingType: listing.listingType,
          reviewerName,
          rating: ratingValue,
          review,
          createdAt: reviewDoc.createdAt.toISOString(),
        },
        pending: true,
        rating: summary.rating,
        reviewCount: summary.reviewCount,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error submitting review:", error);
    return NextResponse.json(
      { success: false, message: "Unable to submit your review." },
      { status: 500 }
    );
  }
}

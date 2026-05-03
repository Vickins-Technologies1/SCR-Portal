import type { Db } from "mongodb";

export type ListingType = "rentals" | "airbnb" | "sale";

export interface ReviewSummary {
  rating: number;
  reviewCount: number;
}

export interface PropertyReview {
  _id: string;
  listingId: string;
  listingType: ListingType;
  reviewerName: string;
  reviewerEmail?: string;
  rating: number;
  review: string;
  createdAt: string;
  status?: "pending" | "approved" | "rejected";
}

export const REVIEW_COLLECTION = "propertyReviews";

const toISO = (value?: Date | string | null): string => {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const roundRating = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(1)) : 0;

export async function getReviewSummaryForListing(
  db: Db,
  listingId: string
): Promise<ReviewSummary> {
  if (!listingId) return { rating: 0, reviewCount: 0 };

  const results = await db
    .collection(REVIEW_COLLECTION)
    .aggregate([
      {
        $match: {
          listingId,
          $or: [{ status: "approved" }, { status: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: "$listingId",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  if (!results.length) return { rating: 0, reviewCount: 0 };

  const summary = results[0] as { avgRating?: number; reviewCount?: number };
  return {
    rating: roundRating(summary.avgRating ?? 0),
    reviewCount: summary.reviewCount ?? 0,
  };
}

export async function getReviewSummaryForListings(
  db: Db,
  listingIds: string[]
): Promise<Map<string, ReviewSummary>> {
  if (!listingIds.length) return new Map();

  const results = await db
    .collection(REVIEW_COLLECTION)
    .aggregate([
      {
        $match: {
          listingId: { $in: listingIds },
          $or: [{ status: "approved" }, { status: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: "$listingId",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const summaryMap = new Map<string, ReviewSummary>();
  results.forEach((row) => {
    const listingId = String((row as { _id?: string })._id || "");
    if (!listingId) return;
    const avgRating = Number((row as { avgRating?: number }).avgRating ?? 0);
    const reviewCount = Number((row as { reviewCount?: number }).reviewCount ?? 0);
    summaryMap.set(listingId, { rating: roundRating(avgRating), reviewCount });
  });
  return summaryMap;
}

export async function getReviewsForListing(
  db: Db,
  listingId: string,
  limit = 25
): Promise<PropertyReview[]> {
  if (!listingId) return [];

  const reviews = await db
    .collection(REVIEW_COLLECTION)
    .find({
      listingId,
      $or: [{ status: "approved" }, { status: { $exists: false } }],
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return reviews.map((review) => ({
    _id: review._id?.toString?.() || "",
    listingId: String(review.listingId || listingId),
    listingType: (review.listingType as ListingType) || "rentals",
    reviewerName: review.reviewerName || "Guest",
    reviewerEmail: review.reviewerEmail || undefined,
    rating: Number(review.rating || 0),
    review: review.review || "",
    createdAt: toISO(review.createdAt),
    status: (review.status as PropertyReview["status"]) || "approved",
  }));
}

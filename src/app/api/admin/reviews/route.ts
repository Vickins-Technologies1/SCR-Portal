import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { REVIEW_COLLECTION } from "@/lib/property-reviews";

const normalizeStatus = (value?: string | null) => {
  if (!value) return "pending";
  const normalized = value.toLowerCase();
  if (["pending", "approved", "rejected"].includes(normalized)) return normalized;
  return "pending";
};

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;

  if (!role || role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = normalizeStatus(searchParams.get("status"));
    const limitParam = searchParams.get("limit");
    const limit = limitParam && Number.isFinite(Number(limitParam)) ? Number(limitParam) : 50;

    const { db } = await connectToDatabase();

    const statusFilter =
      status === "approved"
        ? { $or: [{ status: "approved" }, { status: { $exists: false } }] }
        : { status };

    const reviews = await db
      .collection(REVIEW_COLLECTION)
      .find(statusFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, limit)))
      .toArray();

    return NextResponse.json(
      {
        success: true,
        reviews: reviews.map((review) => ({
          _id: review._id?.toString?.() || "",
          listingId: review.listingId || "",
          listingType: review.listingType || "rentals",
          propertyName: review.propertyName || "Property",
          reviewerName: review.reviewerName || "Guest",
          reviewerEmail: review.reviewerEmail || undefined,
          rating: Number(review.rating || 0),
          review: review.review || "",
          status: review.status || "approved",
          createdAt: review.createdAt ? new Date(review.createdAt).toISOString() : "",
          moderatedAt: review.moderatedAt ? new Date(review.moderatedAt).toISOString() : undefined,
          moderatedByName: review.moderatedByName || undefined,
          moderationNote: review.moderationNote || undefined,
        })),
      },
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

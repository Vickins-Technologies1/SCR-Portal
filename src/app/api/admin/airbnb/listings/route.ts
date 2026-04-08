import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();

    const listings = await db
      .collection("airbnbListings")
      .aggregate([
        {
          $addFields: {
            ownerObjectId: {
              $convert: {
                input: "$ownerId",
                to: "objectId",
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: "propertyOwners",
            localField: "ownerObjectId",
            foreignField: "_id",
            as: "owner",
          },
        },
        { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: { $toString: "$_id" },
            ownerId: 1,
            ownerName: { $ifNull: ["$owner.name", "—"] },
            ownerEmail: { $ifNull: ["$owner.email", "—"] },
            name: 1,
            location: 1,
            status: 1,
            units: 1,
            baseRate: 1,
            weekendRate: 1,
            occupancyRate: 1,
            rating: 1,
            reviewCount: 1,
            lastSyncedAt: { $ifNull: ["$lastSyncedAt", "$updatedAt"] },
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    return NextResponse.json({ success: true, listings });
  } catch (error) {
    console.error("Admin Airbnb listings error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

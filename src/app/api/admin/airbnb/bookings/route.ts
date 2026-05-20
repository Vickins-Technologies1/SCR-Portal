import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:airbnb:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db } = await connectToDatabase();

    const bookings = await db
      .collection("airbnbBookings")
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
            listingName: 1,
            guestName: 1,
            checkIn: 1,
            checkOut: 1,
            nights: 1,
            total: 1,
            status: 1,
            source: 1,
            payoutStatus: 1,
            createdAt: 1,
          },
        },
        { $sort: { checkIn: 1 } },
      ])
      .toArray();

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    console.error("Admin Airbnb bookings error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

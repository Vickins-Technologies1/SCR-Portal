import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:airbnb:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db } = await connectToDatabase();

    const now = new Date();
    const nowIso = now.toISOString();
    const upcomingIso = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalListings,
      totalBookings,
      totalMessages,
      totalPayouts,
      totalIntegrations,
      pendingPayouts,
      unreadMessages,
      upcomingBookings,
      ownerIds,
    ] = await Promise.all([
      db.collection("airbnbListings").countDocuments(),
      db.collection("airbnbBookings").countDocuments(),
      db.collection("airbnbConversations").countDocuments(),
      db.collection("airbnbPayouts").countDocuments(),
      db.collection("airbnbIntegrations").countDocuments(),
      db.collection("airbnbPayouts").countDocuments({ status: "pending" }),
      db.collection("airbnbConversations").countDocuments({ unread: { $gt: 0 } }),
      db.collection("airbnbBookings").countDocuments({
        checkIn: { $gte: nowIso, $lte: upcomingIso },
      }),
      db.collection("airbnbListings").distinct("ownerId"),
    ]);

    const recentBookings = await db
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
            listingName: 1,
            guestName: 1,
            checkIn: 1,
            checkOut: 1,
            total: 1,
            status: 1,
            ownerEmail: { $ifNull: ["$owner.email", "—"] },
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      overview: {
        totals: {
          listings: totalListings,
          bookings: totalBookings,
          messages: totalMessages,
          payouts: totalPayouts,
          integrations: totalIntegrations,
          owners: ownerIds.length,
        },
        alerts: {
          pendingPayouts,
          unreadMessages,
          upcomingBookings,
        },
        recentBookings,
      },
    });
  } catch (error) {
    console.error("Admin Airbnb overview error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

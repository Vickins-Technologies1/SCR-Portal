import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:airbnb:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db } = await connectToDatabase();

    const conversations = await db
      .collection("airbnbConversations")
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
            guestName: 1,
            listingName: 1,
            lastMessage: 1,
            unread: { $ifNull: ["$unread", 0] },
            channel: { $ifNull: ["$channel", "Airbnb"] },
            lastMessageAt: 1,
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ])
      .toArray();

    return NextResponse.json({ success: true, conversations });
  } catch (error) {
    console.error("Admin Airbnb messages error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

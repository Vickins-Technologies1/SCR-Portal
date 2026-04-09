import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();

    const integrations = await db
      .collection("airbnbIntegrations")
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
            provider: 1,
            status: 1,
            description: 1,
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Admin Airbnb integrations error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

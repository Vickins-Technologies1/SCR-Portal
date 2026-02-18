// src/app/api/admin/properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface Property {
  _id?: ObjectId;
  name: string;
  ownerId: string;
  unitTypes: { type: string; price?: number; deposit?: number; managementType: string; managementFee?: number }[];
  createdAt: Date;
  updatedAt: Date;
}

interface UnitTypeInput {
  type?: string;
  price?: number;
  deposit?: number;
  managementType?: string;
  managementFee?: number;
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const properties = await db
      .collection<Property>("properties")
      .aggregate([
        // 1. Lookup owner email
        {
          $lookup: {
            from: "propertyOwners",
            let: { ownerId: { $toObjectId: "$ownerId" } },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$ownerId"] } } },
              { $project: { email: 1 } },
            ],
            as: "owner",
          },
        },
        { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },

        // 2. Lookup ALL pending invoices for this OWNER
        {
          $lookup: {
            from: "invoices",
            let: { ownerIdStr: "$ownerId" },           // ← ownerId is string
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$userId", "$$ownerIdStr"] },   // ← FIXED: use userId
                      { $eq: ["$status", "pending"] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  totalUnpaid: { $sum: "$amount" },
                  count: { $sum: 1 },                     // optional: number of pending invoices
                },
              },
            ],
            as: "unpaidSummary",
          },
        },

        // 3. Extract the value (or default to 0)
        {
          $addFields: {
            totalUnpaidInvoices: {
              $cond: {
                if: { $gt: [{ $size: "$unpaidSummary" }, 0] },
                then: { $arrayElemAt: ["$unpaidSummary.totalUnpaid", 0] },
                else: 0,
              },
            },
            unpaidInvoiceCount: {
              $cond: {
                if: { $gt: [{ $size: "$unpaidSummary" }, 0] },
                then: { $arrayElemAt: ["$unpaidSummary.count", 0] },
                else: 0,
              },
            },
          },
        },

        // 4. Clean up
        { $unset: "unpaidSummary" },

        // 5. Final projection
        {
          $project: {
            _id: { $toString: "$_id" },
            name: 1,
            ownerId: 1,
            ownerEmail: { $ifNull: ["$owner.email", "N/A"] },
            unitTypes: 1,
            totalUnpaidInvoices: 1,
            unpaidInvoiceCount: 1,           // optional – you can remove if not needed
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      properties,
    });
  } catch (error: unknown) {
    console.error("Properties fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}


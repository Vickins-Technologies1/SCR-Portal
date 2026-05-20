import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { requireAdmin } from "../../../../lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:owners:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const matchStage: any = { role: "propertyOwner" };

    if (statusFilter === "pending") {
      matchStage.isApproved = false;
    } else if (statusFilter === "approved") {
      matchStage.isApproved = true;
    }

    const propertyOwners = await db
      .collection("propertyOwners")
      .aggregate([
        { $match: matchStage },

        // Lookup for properties count
        {
          $lookup: {
            from: "properties",
            localField: "_id",
            foreignField: "ownerId",
            as: "propertiesArray",
          },
        },

        // Lookup for payments count
        {
          $lookup: {
            from: "payments",
            localField: "_id",
            foreignField: "ownerId",
            as: "paymentsArray",
          },
        },

        // Lookup for invoices count
        {
          $lookup: {
            from: "invoices",
            localField: "_id",
            foreignField: "ownerId",
            as: "invoicesArray",
          },
        },

        // ── Safe date projection ───────────────────────────────────────────────
        {
          $project: {
            _id: { $toString: "$_id" },
            email: 1,
            name: 1,
            phone: 1,
            role: 1,
            managementType: 1,
            createdAt: {
              $switch: {
                branches: [
                  {
                    case: { $eq: [{ $type: "$createdAt" }, "date"] },
                    then: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                  },
                  {
                    case: { $eq: [{ $type: "$createdAt" }, "string"] },
                    then: {
                      $cond: {
                        if: { $regexMatch: { input: "$createdAt", regex: "^\\d{4}-\\d{2}-\\d{2}" } },
                        then: { $substr: ["$createdAt", 0, 10] },
                        else: "$createdAt" // or "Invalid date"
                      }
                    }
                  }
                ],
                default: "—"
              }
            },
            isApproved: 1,
            approvedAt: {
              $cond: {
                if: { $eq: ["$isApproved", true] },
                then: {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: [{ $type: "$approvedAt" }, "date"] },
                        then: { $dateToString: { format: "%Y-%m-%d", date: "$approvedAt" } }
                      },
                      {
                        case: { $eq: [{ $type: "$approvedAt" }, "string"] },
                        then: {
                          $cond: {
                            if: { $regexMatch: { input: "$approvedAt", regex: "^\\d{4}-\\d{2}-\\d{2}" } },
                            then: { $substr: ["$approvedAt", 0, 10] },
                            else: "$approvedAt"
                          }
                        }
                      }
                    ],
                    default: "—"
                  }
                },
                else: null
              }
            },
            propertiesCount: { $size: "$propertiesArray" },
            paymentsCount: { $size: "$paymentsArray" },
            invoicesCount: { $size: "$invoicesArray" },
          }
        },

        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    const count = await db.collection("propertyOwners").countDocuments(matchStage);

    return NextResponse.json({
      success: true,
      propertyOwners,
      count,
    });
  } catch (error: unknown) {
    console.error("Fetch property owners error:", error);
    return NextResponse.json(
      { success: false, message: "Server error", error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:owners:manage");
  if (auth instanceof NextResponse) return auth;

  try {
    const { name, email, phone, password } = await request.json();

    if (!name || !email || !phone || !password) {
      return NextResponse.json({ success: false, message: "All fields required" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const existing = await db.collection("propertyOwners").findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ success: false, message: "Email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.collection("propertyOwners").insertOne({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: "propertyOwner",
      managementType: "rentals",
      tier: "premium",
      isApproved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const newOwner = await db.collection("propertyOwners").findOne({ _id: result.insertedId });

    return NextResponse.json({
      success: true,
      message: "Owner created (pending approval)",
        propertyOwner: {
          _id: newOwner?._id.toString(),
          name: newOwner?.name,
          email: newOwner?.email,
          phone: newOwner?.phone,
          role: newOwner?.role,
          managementType: newOwner?.managementType || "rentals",
          isApproved: newOwner?.isApproved ?? false,
          createdAt: newOwner?.createdAt instanceof Date
            ? newOwner.createdAt.toISOString().split("T")[0]
            : "—",
        propertiesCount: 0,
        paymentsCount: 0,
        invoicesCount: 0,
      },
    });
  } catch (error) {
    console.error("Create property owner error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// Optional: you can also add PUT and DELETE handlers here if they're not in separate files

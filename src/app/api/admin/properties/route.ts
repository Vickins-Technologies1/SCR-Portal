import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface Property {
  _id?: ObjectId; // Optional _id for POST handler
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
        {
          $project: {
            _id: { $toString: "$_id" },
            name: 1,
            ownerId: 1,
            ownerEmail: { $ifNull: ["$owner.email", "N/A"] },
            unitTypes: 1,
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

export async function POST(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, ownerId, unitTypes } = await request.json();
    if (!name || !ownerId) {
      return NextResponse.json({ success: false, message: "Name and ownerId are required" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    // Validate ownerId exists in propertyOwners collection
    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) });
    if (!owner) {
      return NextResponse.json({ success: false, message: "Invalid or non-existent ownerId" }, { status: 400 });
    }

    // Validate unitTypes if provided
    const validatedUnitTypes = Array.isArray(unitTypes)
      ? unitTypes.map((unit: UnitTypeInput) => ({
          type: unit.type || "Unknown",
          price: typeof unit.price === "number" ? unit.price : undefined,
          deposit: typeof unit.deposit === "number" ? unit.deposit : undefined,
          managementType: unit.managementType || "Unknown",
          managementFee: typeof unit.managementFee === "number" ? unit.managementFee : undefined,
        }))
      : [];

    const newProperty: Property = {
      name,
      ownerId,
      unitTypes: validatedUnitTypes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("properties").insertOne(newProperty);

    return NextResponse.json({
      success: true,
      property: {
        ...newProperty,
        _id: result.insertedId.toString(),
        ownerEmail: owner.email || "N/A",
      },
    });
  } catch (error: unknown) {
    console.error("Property creation error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
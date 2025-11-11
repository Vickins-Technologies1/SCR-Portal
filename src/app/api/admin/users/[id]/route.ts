// src/app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { Db, ObjectId, MongoClient } from "mongodb";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(id) });

    if (!owner) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      propertyOwner: {
        ...owner,
        _id: owner._id.toString(),
        createdAt: owner.createdAt instanceof Date ? owner.createdAt.toISOString() : String(owner.createdAt),
      },
    });
  } catch (error) {
    console.error("User fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    const { name, email, phone } = await request.json();
    const { db } = await connectToDatabase();

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    const result = await db
      .collection("propertyOwners")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" }
      );

    if (!result) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      propertyOwner: {
        ...result,
        _id: result._id.toString(),
        createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : String(result.createdAt),
      },
    });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// DELETE: Full Cascade Delete (Fixed for MongoDB 4.0+)
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const role = request.cookies.get("role")?.value;

  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
  }

  const userObjectId = new ObjectId(id);
  let client: MongoClient;

  try {
    const connection = await connectToDatabase();
    const db = connection.db;
    client = connection.client; // Now we get client from your helper

    const session = client.startSession();
    const deletedCounts = {
      owner: 0,
      properties: 0,
      tenants: 0,
      invoices: 0,
      payments: 0,
    };

    await session.withTransaction(async () => {
      // 1. Get all property IDs
      const properties = await db
        .collection("properties")
        .find({ ownerId: userObjectId }, { session })
        .toArray();

      const propertyIds = properties.map(p => p._id);
      const propertyIdStrings = propertyIds.map(id => id.toString());

      // 2. Delete Tenants
      if (propertyIds.length > 0) {
        const tenantsRes = await db
          .collection("tenants")
          .deleteMany({ propertyId: { $in: propertyIds } }, { session });
        deletedCounts.tenants = tenantsRes.deletedCount;
      }

      // 3. Delete Invoices
      const invoicesRes = await db
        .collection("invoices")
        .deleteMany(
          {
            $or: [
              { userId: userObjectId.toString() },
              { propertyId: { $in: propertyIdStrings } }
            ]
          },
          { session }
        );
      deletedCounts.invoices = invoicesRes.deletedCount;

      // 4. Delete Payments
      const paymentsRes = await db
        .collection("payments")
        .deleteMany(
          {
            $or: [
              { userId: userObjectId.toString() },
              { propertyId: { $in: propertyIdStrings } }
            ]
          },
          { session }
        );
      deletedCounts.payments = paymentsRes.deletedCount;

      // 5. Delete Properties
      if (propertyIds.length > 0) {
        const propsRes = await db
          .collection("properties")
          .deleteMany({ _id: { $in: propertyIds } }, { session });
        deletedCounts.properties = propsRes.deletedCount;
      }

      // 6. Delete User
      const ownerRes = await db
        .collection("propertyOwners")
        .deleteOne({ _id: userObjectId }, { session });
      deletedCounts.owner = ownerRes.deletedCount;
    });

    if (deletedCounts.owner === 0) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    console.log(`User ${id} fully deleted:`, deletedCounts);

    return NextResponse.json({
      success: true,
      message: "User and all data deleted",
      deleted: deletedCounts,
    });
  } catch (error) {
    console.error("Cascade delete failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete user" },
      { status: 500 }
    );
  }
}
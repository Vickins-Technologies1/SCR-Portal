import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const propertyOwnerId = url.searchParams.get("propertyOwnerId");

    if (!propertyOwnerId) {
      return NextResponse.json({ success: false, message: "Missing propertyOwnerId" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner" || userId !== propertyOwnerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    // Find all properties owned by the property owner
    const properties = await db.collection("properties").find({ ownerId: propertyOwnerId }).toArray();
    const propertyIds = properties.map((p) => p._id.toString());

    // Find all payments for those properties
    const payments = await db.collection("payments").find({ propertyId: { $in: propertyIds } }).toArray();

    return NextResponse.json({
      success: true,
      data: payments.map((p) => ({
        _id: p._id.toString(),
        tenantId: p.tenantId,
        tenantName: p.tenantName || "Unknown Tenant",
        propertyId: p.propertyId.toString(),
        propertyName: properties.find((prop) => prop._id.toString() === p.propertyId.toString())?.name || "Unassigned",
        amount: p.amount,
        date: p.dueDate || p.createdAt,
        status: p.status,
        ownerId: p.ownerId || propertyOwnerId,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export const runtime = "nodejs";
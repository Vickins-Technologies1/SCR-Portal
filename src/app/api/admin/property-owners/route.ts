import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  console.log("GET /api/admin/property-owners - Role:", role);

  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    let query: any = { role: "propertyOwner" };

    if (statusFilter === "pending") {
      query.isApproved = false;
    } else if (statusFilter === "approved") {
      query.isApproved = true;
    }
    // if no status → show all (default behavior)

    const propertyOwners = await db
      .collection("propertyOwners")
      .find(query)
      .project({
        _id: 1,
        email: 1,
        name: 1,
        phone: 1,
        role: 1,
        createdAt: 1,
        isApproved: 1,
        approvedAt: 1,
        properties: 1,
        payments: 1,
        invoices: 1,
      })
      .sort({ createdAt: -1 }) // newest first
      .toArray();

    const count = await db.collection("propertyOwners").countDocuments(query);

    return NextResponse.json({
      success: true,
      propertyOwners: propertyOwners.map((po) => ({
        ...po,
        _id: po._id.toString(),
        createdAt: po.createdAt instanceof Date ? po.createdAt.toISOString() : String(po.createdAt),
        approvedAt: po.approvedAt instanceof Date ? po.approvedAt.toISOString() : po.approvedAt || null,
        properties: po.properties || [],
        payments: po.payments || [],
        invoices: po.invoices || [],
      })),
      count,
    });
  } catch (error) {
    console.error("Fetch property owners error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

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
      isApproved: false,           // ← admin must approve even when created by admin
      createdAt: new Date(),
      updatedAt: new Date(),
      properties: [],
      payments: [],
      invoices: [],
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
        isApproved: newOwner?.isApproved ?? false,
        createdAt: newOwner?.createdAt.toISOString(),
        properties: [],
        payments: [],
        invoices: [],
      },
    });
  } catch (error) {
    console.error("Create property owner error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
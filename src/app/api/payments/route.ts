import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
}

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  status: string;
  paymentStatus: string;
  leaseStartDate: string;
  walletBalance: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");

  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    if (role === "propertyOwner") {
      const properties = await db
        .collection<Property>("properties")
        .find({ ownerId: userId })
        .toArray();

      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        return NextResponse.json({ success: true, payments: [] }, { status: 200 });
      }

      const payments = await db
        .collection<Payment>("payments")
        .find({ propertyId: { $in: propertyIds } })
        .toArray();

      return NextResponse.json({
        success: true,
        payments: payments.map((p) => ({
          _id: p._id.toString(),
          tenantId: p.tenantId,
          amount: p.amount,
          propertyId: p.propertyId,
          paymentDate: p.paymentDate,
          transactionId: p.transactionId,
          status: p.status,
        })),
      });
    }

    if (role === "tenant") {
      if (!tenantId || tenantId !== userId) {
        return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
      }

      const payments = await db
        .collection<Payment>("payments")
        .find({ tenantId })
        .toArray();

      return NextResponse.json({
        success: true,
        payments: payments.map((p) => ({
          _id: p._id.toString(),
          tenantId: p.tenantId,
          amount: p.amount,
          propertyId: p.propertyId,
          paymentDate: p.paymentDate,
          transactionId: p.transactionId,
          status: p.status,
        })),
      });
    }

    if (role === "admin") {
      const query = tenantId ? { tenantId } : {};
      const payments = await db.collection<Payment>("payments").find(query).toArray();

      return NextResponse.json({
        success: true,
        payments: payments.map((p) => ({
          _id: p._id.toString(),
          tenantId: p.tenantId,
          amount: p.amount,
          propertyId: p.propertyId,
          paymentDate: p.paymentDate,
          transactionId: p.transactionId,
          status: p.status,
        })),
      });
    }

    return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
  } catch (error: unknown) { // Changed from any to unknown
    console.error("GET Payments Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Server error while fetching payments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tenantId, amount, propertyId, userId: submittedUserId } = body;

    if (!tenantId || !amount || amount <= 0 || !propertyId || submittedUserId !== userId) {
      return NextResponse.json({ success: false, message: "Invalid input" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId), propertyId });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    if (role === "propertyOwner") {
      const property = await db
        .collection<Property>("properties")
        .findOne({ _id: new ObjectId(propertyId), ownerId: userId });

      if (!property) {
        return NextResponse.json({ success: false, message: "Unauthorized: Property not owned" }, { status: 403 });
      }
    }

    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const paymentDate = new Date().toISOString();

    const payment: Payment = {
      _id: new ObjectId(),
      tenantId,
      amount: Number(amount),
      propertyId,
      paymentDate,
      transactionId,
      status: "completed",
      createdAt: new Date().toISOString(),
    };

    await db.collection<Payment>("payments").insertOne(payment);

    await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      { $inc: { walletBalance: Number(amount) } }
    );

    return NextResponse.json({ success: true, message: "Payment processed", payment });
  } catch (error: unknown) { // Changed from any to unknown
    console.error("POST Payment Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Server error while processing payment" }, { status: 500 });
  }
}
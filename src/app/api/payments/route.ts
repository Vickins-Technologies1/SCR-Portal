// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  type?: "Rent" | "Utility";
  phoneNumber?: string;
  reference?: string;
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
  name: string;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  const propertyId = searchParams.get("propertyId");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
  const sort = searchParams.get("sort") || "-paymentDate";

  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const skip = (page - 1) * limit;

    let query: any = {};

    if (role === "propertyOwner") {
      const properties = await db
        .collection<Property>("properties")
        .find({ ownerId: userId })
        .toArray();
      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        logger.debug("No properties found for user", { userId });
        return NextResponse.json({ success: true, payments: [], total: 0, page, limit, totalPages: 0 }, { status: 200 });
      }

      query.propertyId = propertyId && propertyId !== "all" ? propertyId : { $in: propertyIds };
    } else if (role === "tenant") {
      if (!tenantId || tenantId !== userId) {
        logger.error("Unauthorized tenant access", { userId, tenantId });
        return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
      }
      query.tenantId = tenantId;
    } else if (role === "admin") {
      if (tenantId) query.tenantId = tenantId;
    } else {
      logger.error("Invalid role", { role });
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
    }

    const total = await db.collection<Payment>("payments").countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    const payments = await db
      .collection<Payment>("payments")
      .aggregate([
        { $match: query },
        { $sort: { paymentDate: sort === "-paymentDate" ? -1 : 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "tenants",
            localField: "tenantId",
            foreignField: "_id",
            as: "tenant",
          },
        },
        { $unwind: { path: "$tenant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: { $toString: "$_id" },
            tenantId: 1,
            amount: 1,
            propertyId: 1,
            paymentDate: 1,
            transactionId: 1,
            status: 1,
            type: 1,
            phoneNumber: 1,
            reference: 1,
            tenantName: { $ifNull: ["$tenant.name", "Unknown"] },
          },
        },
      ])
      .toArray();

    logger.debug("Payments fetched", {
      userId,
      role,
      tenantId,
      propertyId,
      page,
      limit,
      total,
      paymentsCount: payments.length,
    });

    return NextResponse.json({
      success: true,
      payments,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: unknown) {
    logger.error("GET Payments Error", {
      message: error instanceof Error ? error.message : String(error),
    });
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
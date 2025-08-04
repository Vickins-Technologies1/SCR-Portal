import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId, Db, Filter } from "mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

// Interface for API response
interface Payment {
  _id: string;
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
  date: string;
  tenantName?: string;
}

// Interface for database model
interface PaymentDb {
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
  date: string;
  tenantName?: string;
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
  leaseStart: string;
  walletBalance: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
}

interface ApiResponse<T> {
  success: boolean;
  payments?: T;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  message?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Payment[]>>> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  const propertyId = searchParams.get("propertyId");
  const tenantName = searchParams.get("tenantName");
  const type = searchParams.get("type") as "Rent" | "Utility" | undefined;
  const status = searchParams.get("status") as "completed" | "pending" | "failed" | undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
  const sort = searchParams.get("sort") || "-paymentDate";

  // Log request details for debugging
  logger.debug("GET /api/payments request", {
    userId,
    role,
    csrfToken,
    tenantId,
    propertyId,
    tenantName,
    type,
    status,
    page,
    limit,
    sort,
  });

  // Validate user and role
  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized: Invalid user or role" }, { status: 401 });
  }

  // Validate CSRF token
  try {
    if (!csrfToken || !validateCsrfToken(request, csrfToken)) {
      logger.error("Invalid or missing CSRF token", { userId, csrfToken });
      return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
    }
  } catch (error) {
    logger.error("CSRF validation error", { userId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, message: "CSRF validation failed" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const skip = (page - 1) * limit;

    const query: Filter<PaymentDb> = {};

    if (role === "propertyOwner") {
      const properties = await db
        .collection<Property>("properties")
        .find({ ownerId: userId }, { projection: { _id: 1 } })
        .toArray();
      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        logger.debug("No properties found for propertyOwner", { userId });
        return NextResponse.json(
          { success: true, payments: [], total: 0, page, limit, totalPages: 0 },
          { status: 200 }
        );
      }

      if (propertyId && propertyId !== "all" && !propertyIds.includes(propertyId)) {
        logger.error("Unauthorized property access", { userId, propertyId });
        return NextResponse.json({ success: false, message: "Unauthorized: Property not owned" }, { status: 403 });
      }

      query.propertyId = propertyId && propertyId !== "all" ? propertyId : { $in: propertyIds };

      const tenants = await db
        .collection<Tenant>("tenants")
        .find({ propertyId: query.propertyId }, { projection: { _id: 1 } })
        .toArray();
      const tenantIds = tenants.map((t) => t._id.toString());
      query.tenantId = tenantIds.length ? { $in: tenantIds } : { $in: [] };
    } else if (role === "tenant") {
      if (!tenantId || tenantId !== userId) {
        logger.error("Unauthorized tenant access", { userId, tenantId });
        return NextResponse.json({ success: false, message: "Unauthorized: Tenant ID mismatch" }, { status: 403 });
      }
      query.tenantId = tenantId;
    } else if (role === "admin") {
      if (tenantId) query.tenantId = tenantId;
      if (propertyId && propertyId !== "all") query.propertyId = propertyId;
    }

    // Apply filters
    if (tenantName) query.tenantName = { $regex: tenantName, $options: "i" };
    if (type) query.type = type;
    if (status) query.status = status;

    await db.collection<PaymentDb>("payments").createIndex({ propertyId: 1, paymentDate: -1 });
    await db.collection<PaymentDb>("payments").createIndex({ tenantId: 1 });

    const total = await db.collection<PaymentDb>("payments").countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    const payments = (await db
      .collection<PaymentDb>("payments")
      .aggregate([
        { $match: query },
        { $sort: { paymentDate: sort === "-paymentDate" ? -1 : 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "tenants",
            let: { tenantId: { $toObjectId: "$tenantId" } },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$tenantId"] } } },
              { $project: { name: 1 } },
            ],
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
            date: "$paymentDate",
          },
        },
      ])
      .toArray()) as Payment[];

    logger.info("Payments fetched successfully", {
      userId,
      role,
      tenantId,
      propertyId,
      tenantName,
      type,
      status,
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
      userId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error while fetching payments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Payment>>> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  // Log POST request details for debugging
  logger.debug("POST /api/payments request", { userId, role, csrfToken });

  // Validate user, role, and CSRF
  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    logger.error("Unauthorized POST attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!csrfToken || !validateCsrfToken(request, csrfToken)) {
      logger.error("Invalid or missing CSRF token in POST", { userId, csrfToken });
      return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
    }
  } catch (error) {
    logger.error("CSRF validation error in POST", { userId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, message: "CSRF validation failed" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { tenantId, amount, propertyId, userId: submittedUserId, type, phoneNumber, reference } = body;

    if (!tenantId || !amount || amount <= 0 || !propertyId || submittedUserId !== userId) {
      logger.error("Invalid POST input", { userId, tenantId, amount, propertyId });
      return NextResponse.json({ success: false, message: "Invalid input" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId), propertyId });

    if (!tenant) {
      logger.error("Tenant not found", { tenantId, propertyId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const paymentId = new ObjectId();
    const payment: Payment = {
      _id: paymentId.toString(),
      tenantId,
      amount,
      propertyId,
      paymentDate: new Date().toISOString(),
      transactionId: `TX${Date.now()}${Math.floor(Math.random() * 1000)}`,
      status: "pending",
      createdAt: new Date().toISOString(),
      type,
      phoneNumber,
      reference,
      date: new Date().toISOString(),
      tenantName: tenant.name,
    };

    const result = await db.collection<PaymentDb>("payments").insertOne({
      ...payment,
      _id: paymentId,
    });

    if (result.acknowledged) {
      logger.info("Payment created successfully", { userId, paymentId: payment._id });
      return NextResponse.json({ success: true, payments: payment }, { status: 201 });
    } else {
      logger.error("Failed to insert payment", { userId, paymentId: payment._id });
      return NextResponse.json({ success: false, message: "Failed to create payment" }, { status: 500 });
    }
  } catch (error: unknown) {
    logger.error("POST Payments Error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error while creating payment" }, { status: 500 });
  }
}
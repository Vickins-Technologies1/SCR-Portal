// src/app/api/tenant/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "../../../../lib/csrf";
import logger from "../../../../lib/logger";
import axios, { AxiosError } from "axios";

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

interface PaymentSettings {
  ownerId: ObjectId;
  umsPayEnabled: boolean;
  umsPayApiKey: string;
  umsPayEmail: string;
  umsPayAccountId: string;
}

interface UmsPayErrorResponse {
  success: string;
  errorMessage?: string;
  transaction_request_id?: string;
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
    logger.error("Invalid CSRF token", { userId, csrfToken, cookies: request.cookies.getAll() });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const skip = (page - 1) * limit;

  const query: {
  tenantId?: string;
  propertyId?: string | { $in: string[] };
} = {};


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

    // Log query and tenantIds for debugging
    const paymentDocs = await db.collection<Payment>("payments").find(query).toArray();
    const tenantIds = paymentDocs.map((p) => p.tenantId);

    const payments = await db
      .collection<Payment>("payments")
      .aggregate([
        { $match: query },
        { $sort: { paymentDate: sort === "-paymentDate" ? -1 : 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $addFields: {
            tenantIdObj: {
              $cond: {
                if: { $eq: [{ $type: "$tenantId" }, "string"] },
                then: { $toObjectId: "$tenantId" },
                else: "$tenantId",
              },
            },
          },
        },
        {
          $lookup: {
            from: "tenants",
            localField: "tenantIdObj",
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

    logger.debug(`Payments fetched for ${role}`, {
      userId,
      propertyId,
      tenantId,
      page,
      limit,
      total,
      paymentsCount: payments.length,
      propertyIds: role === "propertyOwner" ? propertyId : undefined,
      tenantIds,
      tenantNames: payments.map((p) => p.tenantName),
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
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
      role,
      propertyId,
      tenantId,
    });
    return NextResponse.json({ success: false, message: "Server error while fetching payments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId, csrfToken, cookies: request.cookies.getAll() });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { tenantId, amount, propertyId, userId: submittedUserId, type, phoneNumber, reference } = body;

    // Input validation
    if (!tenantId) return NextResponse.json({ success: false, message: "Missing tenantId" }, { status: 400 });
    if (!amount || amount < 10) return NextResponse.json({ success: false, message: "Amount must be at least 10 KES" }, { status: 400 });
    if (!propertyId) return NextResponse.json({ success: false, message: "Missing propertyId" }, { status: 400 });
    if (submittedUserId !== userId) return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "Missing payment type" }, { status: 400 });
    if (!phoneNumber) return NextResponse.json({ success: false, message: "Missing phone number" }, { status: 400 });
    if (!reference) return NextResponse.json({ success: false, message: "Missing transaction reference" }, { status: 400 });

    const { db }: { db: Db } = await connectToDatabase();

    // Validate property and get ownerId
    const property = await db.collection<Property>("properties").findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      logger.error("Property not found", { propertyId });
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    // Fetch payment settings for the owner
    const paymentSettings = await db
      .collection<PaymentSettings>("paymentSettings")
      .findOne({ ownerId: new ObjectId(property.ownerId) });

    if (!paymentSettings || !paymentSettings.umsPayEnabled) {
      logger.error(`UMS Pay not enabled for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "UMS Pay is not enabled for this property owner" },
        { status: 400 }
      );
    }

    const { umsPayApiKey, umsPayEmail, umsPayAccountId } = paymentSettings;

    logger.debug(`UMS Pay credentials for ownerId: ${property.ownerId}`, {
      umsPayApiKey: umsPayApiKey ? "[REDACTED]" : "MISSING",
      umsPayEmail: umsPayEmail || "MISSING",
      umsPayAccountId: umsPayAccountId || "MISSING",
    });

    if (!umsPayApiKey || !umsPayEmail || !umsPayAccountId) {
      logger.error(`Incomplete UMS Pay configuration for ownerId: ${property.ownerId}`);
      return NextResponse.json({ success: false, message: "Incomplete UMS Pay configuration" }, { status: 400 });
    }

    // Validate tenant exists and fetch tenant name
    const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
    if (!tenant) {
      logger.error("Tenant not found", { tenantId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Skip propertyId check for tenants to allow payments to any valid property
    if (role === "propertyOwner") {
      const propertyCheck = await db
        .collection<Property>("properties")
        .findOne({ _id: new ObjectId(propertyId), ownerId: userId });

      if (!propertyCheck) {
        logger.error("Unauthorized: Property not owned", { userId, propertyId });
        return NextResponse.json({ success: false, message: "Unauthorized: Property not owned" }, { status: 403 });
      }
    }

    // Initiate STK Push via UMS Pay
    const umsPayResponse = await axios.post(
      "https://api.umspay.co.ke/api/v1/initiatestkpush",
      {
        api_key: umsPayApiKey,
        email: umsPayEmail,
        amount,
        msisdn: phoneNumber,
        reference,
        account_id: umsPayAccountId,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const umsPayData = umsPayResponse.data as UmsPayErrorResponse;
    logger.debug("UMS Pay STK Push response", umsPayData);

    if (umsPayData.success !== "200") {
      logger.error("Failed to initiate STK Push", { errorMessage: umsPayData.errorMessage });
      return NextResponse.json(
        { success: false, message: umsPayData.errorMessage || "Failed to initiate STK Push" },
        { status: 400 }
      );
    }

    // Store pending payment
    const transactionId = umsPayData.transaction_request_id!;
    const payment: Payment = {
      _id: new ObjectId(),
      tenantId,
      amount: Number(amount),
      propertyId,
      paymentDate: new Date().toISOString(),
      transactionId,
      status: "pending",
      createdAt: new Date().toISOString(),
      type,
      phoneNumber,
      reference,
    };

    await db.collection<Payment>("payments").insertOne(payment);

    // Update tenant wallet balance
    await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      { $inc: { walletBalance: Number(amount) } }
    );

    return NextResponse.json({
      success: true,
      message: "STK Push initiated successfully",
      transaction_request_id: transactionId,
      payment: {
        _id: payment._id.toString(),
        tenantName: tenant.name,
        amount: payment.amount,
        propertyId: payment.propertyId,
        paymentDate: payment.paymentDate,
        transactionId: payment.transactionId,
        status: payment.status,
        type: payment.type,
        phoneNumber: payment.phoneNumber,
        reference: payment.reference,
      },
    });
  } catch (error: unknown) {
    const axiosError = error as AxiosError<UmsPayErrorResponse>;
    logger.error("POST Payment Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      response: axiosError.response?.data || null,
    });
    return NextResponse.json(
      {
        success: false,
        message: axiosError.response?.data?.errorMessage || "Server error while processing payment",
      },
      { status: axiosError.response?.status || 500 }
    );
  }
}
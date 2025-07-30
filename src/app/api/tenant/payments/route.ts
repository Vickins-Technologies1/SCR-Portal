import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import axios from "axios";

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed" | "cancelled";
  createdAt: string;
  type: "Rent" | "Utility";
  phoneNumber: string;
  reference: string;
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

interface PaymentSettings {
  ownerId: ObjectId;
  umsPayEnabled: boolean;
  umsPayApiKey: string;
  umsPayEmail: string;
  umsPayAccountId: string;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("X-CSRF-Token");
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  const propertyId = searchParams.get("propertyId");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const sort = searchParams.get("sort") || "-paymentDate";

  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!csrfToken) {
    return NextResponse.json({ success: false, message: "Missing CSRF token" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    // Validate CSRF token (assuming a simple check against a stored session token)
    const session = await db.collection("sessions").findOne({ csrfToken });
    if (!session) {
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const skip = (page - 1) * limit;

    if (role === "propertyOwner") {
      const properties = await db
        .collection<Property>("properties")
        .find({ ownerId: userId })
        .toArray();

      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        return NextResponse.json({ success: true, payments: [], total: 0 }, { status: 200 });
      }

      const query = {
        propertyId: { $in: propertyIds },
        ...(propertyId && { propertyId }),
      };

      const total = await db.collection<Payment>("payments").countDocuments(query);

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
          { $unwind: "$tenant" },
          {
            $project: {
              _id: { $toString: "$_id" },
              tenantName: "$tenant.name",
              amount: 1,
              propertyId: 1,
              paymentDate: 1,
              transactionId: 1,
              status: 1,
            },
          },
        ])
        .toArray();

      return NextResponse.json({
        success: true,
        payments,
        total,
      });
    }

    if (role === "tenant") {
      if (!tenantId || tenantId !== userId) {
        return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
      }

      const query = { tenantId };

      const total = await db.collection<Payment>("payments").countDocuments(query);

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
          { $unwind: "$tenant" },
          {
            $project: {
              _id: { $toString: "$_id" },
              tenantName: "$tenant.name",
              amount: 1,
              propertyId: 1,
              paymentDate: 1,
              transactionId: 1,
              status: 1,
            },
          },
        ])
        .toArray();

      return NextResponse.json({
        success: true,
        payments,
        total,
      });
    }

    if (role === "admin") {
      const query = tenantId ? { tenantId } : {};

      const total = await db.collection<Payment>("payments").countDocuments(query);

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
          { $unwind: "$tenant" },
          {
            $project: {
              _id: { $toString: "$_id" },
              tenantName: "$tenant.name",
              amount: 1,
              propertyId: 1,
              paymentDate: 1,
              transactionId: 1,
              status: 1,
            },
          },
        ])
        .toArray();

      return NextResponse.json({
        success: true,
        payments,
        total,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
  } catch (error: any) {
    console.error("GET Payments Error:", error);
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
    const { tenantId, amount, propertyId, userId: submittedUserId, csrfToken, type, phoneNumber, reference } = body;

    // Input validation
    if (!tenantId) return NextResponse.json({ success: false, message: "Missing tenantId" }, { status: 400 });
    if (!amount || amount < 10) return NextResponse.json({ success: false, message: "Amount must be at least 10 KES" }, { status: 400 });
    if (!propertyId) return NextResponse.json({ success: false, message: "Missing propertyId" }, { status: 400 });
    if (submittedUserId !== userId) return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 400 });
    if (!csrfToken) return NextResponse.json({ success: false, message: "Missing CSRF token" }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "Missing payment type" }, { status: 400 });
    if (!phoneNumber) return NextResponse.json({ success: false, message: "Missing phone number" }, { status: 400 });
    if (!reference) return NextResponse.json({ success: false, message: "Missing transaction reference" }, { status: 400 });

    const { db }: { db: Db } = await connectToDatabase();

    // Validate CSRF token
    const session = await db.collection("sessions").findOne({ csrfToken });
    if (!session) {
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    // Validate property and get ownerId
    const property = await db
      .collection<Property>("properties")
      .findOne({ _id: new ObjectId(propertyId) });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    // Fetch payment settings for the owner
    const paymentSettings = await db
      .collection<PaymentSettings>("paymentSettings")
      .findOne({ ownerId: new ObjectId(property.ownerId) });

    if (!paymentSettings || !paymentSettings.umsPayEnabled) {
      console.log(`[POST] UMS Pay not enabled for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "UMS Pay is not enabled for this property owner" },
        { status: 400 }
      );
    }

    const { umsPayApiKey, umsPayEmail, umsPayAccountId } = paymentSettings;

    // Log UMS Pay credentials for debugging
    console.log(`[POST] UMS Pay credentials for ownerId: ${property.ownerId}`, {
      umsPayApiKey: umsPayApiKey ? "[REDACTED]" : "MISSING",
      umsPayEmail: umsPayEmail || "MISSING",
      umsPayAccountId: umsPayAccountId || "MISSING",
    });

    if (!umsPayApiKey || !umsPayEmail || !umsPayAccountId) {
      console.log(`[POST] Incomplete UMS Pay configuration for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "Incomplete UMS Pay configuration" },
        { status: 400 }
      );
    }

    // Validate tenant exists and fetch tenant name
    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Skip propertyId check for tenants to allow payments to any valid property
    if (role === "propertyOwner") {
      const propertyCheck = await db
        .collection<Property>("properties")
        .findOne({ _id: new ObjectId(propertyId), ownerId: userId });

      if (!propertyCheck) {
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

    const umsPayData = umsPayResponse.data;
    console.log("[POST] UMS Pay STK Push response:", umsPayData);

    if (umsPayData.success !== "200") {
      return NextResponse.json({ success: false, message: umsPayData.errorMessage || "Failed to initiate STK Push" }, { status: 400 });
    }

    // Store pending payment
    const transactionId = umsPayData.transaction_request_id;
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
  } catch (error: any) {
    console.error("[POST] Payment Error:", error.response?.data || error.message);
    return NextResponse.json(
      { success: false, message: error.response?.data?.errorMessage || "Server error while processing payment" },
      { status: 500 }
    );
  }
}
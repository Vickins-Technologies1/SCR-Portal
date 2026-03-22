// src/app/api/tenant/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { z } from "zod";
import {
  getMpesaPasskey,
  getMpesaShortcode,
  initiateStkPush,
  isValidKenyanMsisdn,
  normalizePhoneNumber,
} from "@/lib/mpesa";

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  landlordId?: string;
  invoiceId?: string;
  status: "completed" | "pending" | "failed" | "cancelled";
  createdAt: string;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber?: string;
  reference?: string;
  mpesaCode?: string | null;
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
  ownerId?: string;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
}

const PaymentRequestSchema = z.object({
  tenantId: z.string().trim().min(1),
  amount: z.preprocess((v) => Number(v), z.number().int().positive()),
  propertyId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  type: z.enum(["Rent", "Utility", "Deposit", "Other"]),
  phoneNumber: z.string().trim().min(1),
  reference: z.string().trim().min(1),
});

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
    logger.error("Invalid CSRF token", { userId, csrfToken });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const skip = (page - 1) * limit;

    const query: { tenantId?: string; propertyId?: string | { $in: string[] } } = {};

    if (role === "propertyOwner") {
      const properties = await db
        .collection<Property>("properties")
        .find({ ownerId: userId })
        .toArray();
      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        return NextResponse.json({ success: true, payments: [], total: 0, page, limit, totalPages: 0 }, { status: 200 });
      }

      query.propertyId = propertyId && propertyId !== "all" ? propertyId : { $in: propertyIds };
    } else if (role === "tenant") {
      if (!tenantId || tenantId !== userId) {
        return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
      }
      query.tenantId = tenantId;
    } else if (role === "admin") {
      if (tenantId) query.tenantId = tenantId;
    } else {
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

    return NextResponse.json({ success: true, payments, total, page, limit, totalPages });
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

  // Auth + CSRF guard for payment initiation
  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const parsed = PaymentRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid request data", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { tenantId, amount, propertyId, userId: submittedUserId, type, phoneNumber, reference } = parsed.data;

  if (submittedUserId !== userId) {
    return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 400 });
  }

  // Normalize and validate Kenya MSISDN
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!isValidKenyanMsisdn(normalizedPhone)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid phone number format. Use +2547xxxxxxxx, +2541xxxxxxxx, 07xxxxxxxx, or 01xxxxxxxx",
      },
      { status: 400 }
    );
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const property = await db.collection<Property>("properties").findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    if (role === "propertyOwner") {
      const propertyCheck = await db
        .collection<Property>("properties")
        .findOne({ _id: new ObjectId(propertyId), ownerId: userId });

      if (!propertyCheck) {
        return NextResponse.json({ success: false, message: "Unauthorized: Property not owned" }, { status: 403 });
      }
    }

    // Use platform-level M-Pesa credentials
    const landlordId = typeof tenant.ownerId === "string" ? tenant.ownerId : property.ownerId;
    const shortcode = getMpesaShortcode();
    const passkey = getMpesaPasskey();
    const callbackBase = process.env.MPESA_CALLBACK_BASE_URL || "";
    if (!callbackBase) {
      return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
    }

    const accountReference = reference.startsWith("INV-") ? reference : `INV-${reference}`;
    // Initiate STK push with landlord shortcode
    const stkResponse = await initiateStkPush({
      shortcode,
      passkey,
      amount,
      phone: normalizedPhone,
      accountReference,
      transactionDesc: `${type} Payment`,
      callbackUrl: `${callbackBase}/api/mpesa/stk-callback`,
    });

    if (stkResponse.ResponseCode !== "0") {
      return NextResponse.json(
        { success: false, message: stkResponse.ResponseDescription || "Failed to initiate payment" },
        { status: 400 }
      );
    }

    const transactionId = stkResponse.CheckoutRequestID;
    const nowIso = new Date().toISOString();
    const payment: Payment = {
      _id: new ObjectId(),
      tenantId,
      amount: Number(amount),
      propertyId,
      paymentDate: nowIso,
      transactionId,
      status: "pending",
      createdAt: nowIso,
      type,
      phoneNumber: normalizedPhone,
      reference,
      mpesaCode: null,
    };

    await db.collection<Payment>("payments").insertOne({
      ...payment,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      landlordId,
    });

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
    logger.error("POST Payment Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
    });
    return NextResponse.json(
      { success: false, message: "Server error while processing payment" },
      { status: 500 }
    );
  }
}

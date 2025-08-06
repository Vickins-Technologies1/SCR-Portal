import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId, Db, Filter } from "mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

interface Payment {
  _id: string;
  tenantId: string | null;
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
  tenantName: string;
  unitType?: string;
}

interface PaymentDb {
  _id: ObjectId;
  tenantId: string | null;
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
  unitType?: string;
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
  unitType?: string;
}

interface Property {
  _id: ObjectId;
  ownerId: string | ObjectId;
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
  const unitType = searchParams.get("unitType");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
  const sort = searchParams.get("sort") || "-paymentDate";

  logger.debug("GET /api/payments request", {
    userId,
    role,
    csrfToken,
    tenantId,
    propertyId,
    tenantName,
    type,
    status,
    unitType,
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
    if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
      logger.error("Invalid or missing CSRF token", { userId, csrfToken });
      return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
    }
  } catch (error) {
    logger.error("CSRF validation error", { userId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, message: "CSRF validation failed" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const query: Filter<PaymentDb> = {};

    if (role === "propertyOwner") {
      const properties = await db
        .collection<Property>("properties")
        .find(
          {
            $or: [{ ownerId: userId }, { ownerId: new ObjectId(userId) }],
          },
          { projection: { _id: 1 } }
        )
        .toArray();
      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        logger.debug("No properties found for propertyOwner", { userId });
        return NextResponse.json(
          { success: true, payments: [], total: 0, page, limit, totalPages: 0 },
          { status: 200 }
        );
      }

      logger.debug("Properties found", { userId, propertyIds });

      if (propertyId && propertyId !== "all" && !propertyIds.includes(propertyId)) {
        logger.error("Unauthorized property access", { userId, propertyId });
        return NextResponse.json({ success: false, message: "Unauthorized: Property not owned" }, { status: 403 });
      }

      query.propertyId = propertyId && propertyId !== "all" ? propertyId : { $in: propertyIds };

      if (tenantId) {
        query.tenantId = tenantId;
        if (unitType) {
          const tenant = await db
            .collection<Tenant>("tenants")
            .findOne({ _id: new ObjectId(tenantId), unitType, propertyId: { $in: propertyIds } });
          if (!tenant) {
            logger.debug("Tenant does not match unitType or property", { tenantId, unitType, propertyIds });
            return NextResponse.json(
              { success: true, payments: [], total: 0, page, limit, totalPages: 0 },
              { status: 200 }
            );
          }
        }
      } else {
        const tenantQuery: Filter<Tenant> = { propertyId: { $in: propertyIds } };
        if (unitType) {
          tenantQuery.unitType = unitType;
        }
        const tenants = await db
          .collection<Tenant>("tenants")
          .find(tenantQuery, { projection: { _id: 1 } })
          .toArray();
        const tenantIds = tenants.map((t) => t._id.toString());
        logger.debug("Tenants found", { userId, tenantIds, unitType });

        query.$or = [
          ...(tenantIds.length ? [{ tenantId: { $in: tenantIds } }] : []),
          { tenantId: { $eq: null } },
          { tenantId: { $exists: false } },
        ];
      }
    } else if (role === "tenant") {
      if (!tenantId || tenantId !== userId) {
        logger.error("Unauthorized tenant access", { userId, tenantId });
        return NextResponse.json({ success: false, message: "Unauthorized: Tenant ID mismatch" }, { status: 403 });
      }
      query.tenantId = tenantId;
      if (unitType) {
        const tenant = await db
          .collection<Tenant>("tenants")
          .findOne({ _id: new ObjectId(tenantId), unitType });
        if (!tenant) {
          logger.debug("Tenant does not match unitType", { tenantId, unitType });
          return NextResponse.json(
            { success: true, payments: [], total: 0, page, limit, totalPages: 0 },
            { status: 200 }
          );
        }
      }
    } else if (role === "admin") {
      if (tenantId) {
        query.tenantId = tenantId;
        if (unitType) {
          const tenant = await db
            .collection<Tenant>("tenants")
            .findOne({ _id: new ObjectId(tenantId), unitType });
          if (!tenant) {
            logger.debug("Tenant does not match unitType", { tenantId, unitType });
            return NextResponse.json(
              { success: true, payments: [], total: 0, page, limit, totalPages: 0 },
              { status: 200 }
            );
          }
        }
      } else if (unitType) {
        const tenantUnitTypes = await db
          .collection<Tenant>("tenants")
          .find({ unitType }, { projection: { _id: 1 } })
          .toArray();
        const tenantIdsWithUnitType = tenantUnitTypes.map((t) => t._id.toString());
        logger.debug("Admin unitType filter", { unitType, tenantIdsWithUnitType });
        query.$or = [
          ...(tenantIdsWithUnitType.length ? [{ tenantId: { $in: tenantIdsWithUnitType } }] : []),
          { tenantId: { $eq: null } },
          { tenantId: { $exists: false } },
        ];
      }
      if (propertyId && propertyId !== "all") query.propertyId = propertyId;
    }

    if (tenantName) query.tenantName = { $regex: tenantName, $options: "i" };
    if (type) query.type = type;
    if (status) query.status = status;
    if (unitType && !query.tenantId && !query.$or) {
      query.unitType = unitType;
    }

    const total = await db.collection<PaymentDb>("payments").countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const adjustedPage = Math.min(page, totalPages);

    const payments = (await db
      .collection<PaymentDb>("payments")
      .aggregate([
        { $match: query },
        { $sort: { paymentDate: sort === "-paymentDate" ? -1 : 1 } },
        { $skip: (adjustedPage - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "tenants",
            let: { tenantId: { $toObjectId: "$tenantId" } },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$tenantId"] } } },
              { $project: { name: 1, unitType: 1 } },
            ],
            as: "tenant",
          },
        },
        { $unwind: { path: "$tenant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: { $toString: "$_id" },
            tenantId: { $ifNull: ["$tenantId", null] },
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
            unitType: { $ifNull: ["$tenant.unitType", "$unitType", "N/A"] },
          },
        },
      ])
      .toArray()) as Payment[];

    if (total === 0) {
      logger.info("No payments found for query", {
        userId,
        role,
        tenantId,
        propertyId,
        tenantName,
        type,
        status,
        unitType,
      });
    }

    logger.info("Payments fetched successfully", {
      userId,
      role,
      tenantId,
      propertyId,
      tenantName,
      type,
      status,
      unitType,
      page: adjustedPage,
      limit,
      total,
      paymentsCount: payments.length,
    });

    return NextResponse.json({
      success: true,
      payments,
      total,
      page: adjustedPage,
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

const UMS_PAY_API_KEY = process.env.UMS_PAY_API_KEY || "";
const UMS_PAY_EMAIL = process.env.UMS_PAY_EMAIL || "";
const UMS_PAY_ACCOUNT_ID = process.env.UMS_PAY_ACCOUNT_ID || "";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("Handling POST request to /api/payments");

    if (!UMS_PAY_API_KEY || !UMS_PAY_EMAIL || !UMS_PAY_ACCOUNT_ID) {
      console.error("Missing UMS Pay configuration:", {
        hasApiKey: !!UMS_PAY_API_KEY,
        hasEmail: !!UMS_PAY_EMAIL,
        hasAccountId: !!UMS_PAY_ACCOUNT_ID,
      });
      return NextResponse.json(
        { success: false, message: "Server configuration error: Missing payment credentials" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { action, amount, msisdn, reference, transactionRequestId } = body;

    if (!action) {
      console.log("Missing action in request body:", body);
      return NextResponse.json(
        { success: false, message: "Action is required" },
        { status: 400 }
      );
    }

    if (action === "initiate") {
      if (!amount || !msisdn || !reference) {
        console.log("Missing required fields for initiate:", { amount, msisdn, reference });
        return NextResponse.json(
          { success: false, message: "Amount, phone number, and reference are required" },
          { status: 400 }
        );
      }

      const requestBody = {
        api_key: UMS_PAY_API_KEY,
        email: UMS_PAY_EMAIL,
        amount,
        msisdn,
        reference,
        account_id: UMS_PAY_ACCOUNT_ID,
      };
      console.log("STK push request body:", requestBody);

      const stkRes = await fetch("https://api.umspay.co.ke/api/v1/initiatestkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const stkData = await stkRes.json();
      console.log("STK push response:", stkData);

      if (!stkRes.ok) {
        console.error("STK push failed:", { status: stkRes.status, response: stkData });
        return NextResponse.json(
          { success: false, message: stkData.errorMessage || "Failed to initiate payment" },
          { status: stkRes.status }
        );
      }

      const duration = Date.now() - startTime;
      console.log(`POST /api/payments completed in ${duration}ms`);
      return NextResponse.json(stkData, { status: 200 });
    }

    if (action === "status") {
      if (!transactionRequestId) {
        console.log("Missing transactionRequestId for status check:", body);
        return NextResponse.json(
          { success: false, message: "Transaction request ID is required" },
          { status: 400 }
        );
      }

      const requestBody = {
        api_key: UMS_PAY_API_KEY,
        email: UMS_PAY_EMAIL,
        transaction_request_id: transactionRequestId,
      };
      console.log("Transaction status request body:", requestBody);

      const statusRes = await fetch("https://api.umspay.co.ke/api/v1/transactionstatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const statusData = await statusRes.json();
      console.log("Transaction status response:", statusData);

      if (!statusRes.ok) {
        console.error("Status check failed:", { status: statusRes.status, response: statusData });
        return NextResponse.json(
          { success: false, message: statusData.errorMessage || "Failed to check transaction status" },
          { status: statusRes.status }
        );
      }

      const duration = Date.now() - startTime;
      console.log(`POST /api/payments completed in ${duration}ms`);
      return NextResponse.json(statusData, { status: 200 });
    }

    console.log("Invalid action:", action);
    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Error in /api/payments:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
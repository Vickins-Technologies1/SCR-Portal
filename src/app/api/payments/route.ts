// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId, Db, Filter } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../lib/csrf";
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
  mpesaCode?: string;
  isManual?: boolean;
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
  mpesaCode?: string;
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
  const loggedInUserId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
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
    loggedInUserId,
    role,
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
  if (!loggedInUserId || !role || !["admin", "propertyOwner", "tenant", "teamMember"].includes(role)) {
    logger.error("Unauthorized access attempt", { loggedInUserId, role });
    return NextResponse.json({ success: false, message: "Unauthorized: Invalid user or role" }, { status: 401 });
  }

  // Determine effective owner for propertyOwner and teamMember
  let effectiveOwnerId = loggedInUserId;

  if (role === "teamMember") {
    const { db }: { db: Db } = await connectToDatabase();

    const teamMember = await db.collection("teamMembers").findOne({
      _id: new ObjectId(loggedInUserId),
      active: true,
    });

    if (!teamMember || !teamMember.ownerId) {
      logger.error("Team member has no assigned owner", { loggedInUserId });
      return NextResponse.json(
        { success: false, message: "Unauthorized: No property owner assigned" },
        { status: 403 }
      );
    }

    effectiveOwnerId = teamMember.ownerId.toString();
  }

  // ── CSRF validation only for mutating methods ───────────────────────────────
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const csrfToken = request.headers.get("x-csrf-token");
    try {
      if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
        logger.error("Invalid or missing CSRF token", { loggedInUserId, csrfToken });
        return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
      }
    } catch (error) {
      logger.error("CSRF validation error", { loggedInUserId, error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ success: false, message: "CSRF validation failed" }, { status: 403 });
    }
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const query: Filter<PaymentDb> = {};

    if (role === "propertyOwner" || role === "teamMember") {
      const properties = await db
        .collection<Property>("properties")
        .find(
          {
            $or: [{ ownerId: effectiveOwnerId }, { ownerId: new ObjectId(effectiveOwnerId) }],
          },
          { projection: { _id: 1 } }
        )
        .toArray();
      const propertyIds = properties.map((p) => p._id.toString());

      if (!propertyIds.length) {
        logger.debug("No properties found for owner", { effectiveOwnerId });
        return NextResponse.json(
          { success: true, payments: [], total: 0, page, limit, totalPages: 0 },
          { status: 200 }
        );
      }

      logger.debug("Properties found", { effectiveOwnerId, propertyIds });

      if (propertyId && propertyId !== "all" && !propertyIds.includes(propertyId)) {
        logger.error("Unauthorized property access", { effectiveOwnerId, propertyId });
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
        logger.debug("Tenants found", { effectiveOwnerId, tenantIds, unitType });

        query.$or = [
          ...(tenantIds.length ? [{ tenantId: { $in: tenantIds } }] : []),
          { tenantId: { $eq: null } },
          { tenantId: { $exists: false } },
        ];
      }
    } else if (role === "tenant") {
      if (!tenantId || tenantId !== loggedInUserId) {
        logger.error("Unauthorized tenant access", { loggedInUserId, tenantId });
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
          $addFields: {
            isManual: {
              $regexMatch: {
                input: { $ifNull: ["$transactionId", ""] },
                regex: "^MANUAL-",
              },
            },
          },
        },
        {
          $project: {
            _id: { $toString: "$_id" },
            tenantId: { $ifNull: ["$tenantId", null] },
            amount: 1,
            propertyId: 1,
            paymentDate: 1,
            transactionId: 1,
            mpesaCode: 1,
            status: 1,
            type: 1,
            phoneNumber: 1,
            reference: 1,
            tenantName: { $ifNull: ["$tenant.name", "Unknown"] },
            date: "$paymentDate",
            isManual: 1,
            createdAt: 1,
            unitType: { $ifNull: ["$tenant.unitType", "$unitType", "N/A"] },
          },
        },
      ])
      .toArray()) as Payment[];

    if (total === 0) {
      logger.info("No payments found for query", {
        loggedInUserId,
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
      loggedInUserId,
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
      loggedInUserId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error while fetching payments" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, message: "Deprecated. Use /api/mpesa/stk-push instead." },
    { status: 410 }
  );
}




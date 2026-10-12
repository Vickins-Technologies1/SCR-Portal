// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId, Db, Filter } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";
import { identityFilter, identityValues, isSuccessfulPaymentStatus, money, SUCCESSFUL_PAYMENT_STATUSES } from "@/lib/payment-query";

interface Payment {
  _id: string;
  tenantId: string | null;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: string;
  createdAt: string;
  type?: "Rent" | "Utility";
  phoneNumber?: string;
  reference?: string;
  date: string;
  tenantName: string;
  unitType?: string;
  mpesaCode?: string;
  isManual?: boolean;
  originalAmount?: number;
  reversedAmount?: number;
  netAmount?: number;
  financialPostingStatus?: string;
  providerConfirmedAmount?: number | null;
  postedAmount?: number | null;
}

interface PaymentDb {
  _id: ObjectId;
  tenantId: string | null;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: string;
  createdAt: string;
  type?: "Rent" | "Utility";
  phoneNumber?: string;
  reference?: string;
  date: string;
  tenantName?: string;
  unitType?: string;
  mpesaCode?: string;
  providerConfirmedAmount?: number | null;
  postedAmount?: number | null;
  financialPostingStatus?: string;
  financialEffectsApplied?: boolean;
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
  const status = searchParams.get("status") as "completed" | "pending" | "pending_stk" | "failed" | undefined;
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
  let teamMemberAssignedPropertyIds: string[] | null = null;

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
    teamMemberAssignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
      ? Array.from(
          new Set(
            (teamMember as any).assignedPropertyIds
              .map((value: any) => String(value || "").trim())
              .filter((value: string) => ObjectId.isValid(value))
          )
        )
      : null;
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
      const propertyFilter: Filter<Property> = {
        $or: [{ ownerId: effectiveOwnerId }, { ownerId: new ObjectId(effectiveOwnerId) }],
      };
      if (role === "teamMember" && teamMemberAssignedPropertyIds && teamMemberAssignedPropertyIds.length > 0) {
        propertyFilter._id = { $in: teamMemberAssignedPropertyIds.map((id) => new ObjectId(id)) };
      }
      const properties = await db
        .collection<Property>("properties")
        .find(propertyFilter, { projection: { _id: 1 } })
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

      query.propertyId = propertyId && propertyId !== "all"
        ? (identityFilter("propertyId", propertyId).propertyId as any)
        : { $in: identityValues(propertyIds) };

      if (tenantId) {
        query.tenantId = identityFilter("tenantId", tenantId).tenantId as any;
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
          ...(tenantIds.length ? [{ tenantId: { $in: tenantIds.flatMap(identityValues) } }] : []),
          { tenantId: { $eq: null } },
          { tenantId: { $exists: false } },
        ] as any;
      }
    } else if (role === "tenant") {
      if (!tenantId || tenantId !== loggedInUserId) {
        logger.error("Unauthorized tenant access", { loggedInUserId, tenantId });
        return NextResponse.json({ success: false, message: "Unauthorized: Tenant ID mismatch" }, { status: 403 });
      }
      query.tenantId = identityFilter("tenantId", tenantId).tenantId as any;
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
        query.tenantId = identityFilter("tenantId", tenantId).tenantId as any;
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
          ...(tenantIdsWithUnitType.length ? [{ tenantId: { $in: tenantIdsWithUnitType.flatMap(identityValues) } }] : []),
          { tenantId: { $eq: null } },
          { tenantId: { $exists: false } },
        ] as any;
      }
      if (propertyId && propertyId !== "all") query.propertyId = identityFilter("propertyId", propertyId).propertyId as any;
    }

    if (tenantName) query.tenantName = { $regex: tenantName, $options: "i" };
    if (type) query.type = type;
    if (status) {
      query.status = status === "completed"
        ? ({ $in: [...SUCCESSFUL_PAYMENT_STATUSES] } as any)
        : status === "pending"
          ? ({ $in: ["pending", "pending_stk", "processing"] } as any)
          : status;
    }
    if (unitType && !query.tenantId && !query.$or) {
      query.unitType = unitType;
    }

    const total = await db.collection<PaymentDb>("payments").countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const adjustedPage = Math.min(page, totalPages);

    const rawPayments = (await db
      .collection<PaymentDb>("payments")
      .aggregate([
        { $match: query },
        { $sort: { paymentDate: sort === "-paymentDate" ? -1 : 1, createdAt: sort === "-paymentDate" ? -1 : 1, _id: sort === "-paymentDate" ? -1 : 1 } },
        { $skip: (adjustedPage - 1) * limit },
        { $limit: limit },
        { $addFields: { tenantIdObj: { $convert: { input: "$tenantId", to: "objectId", onError: null, onNull: null } } } },
        {
          $lookup: {
            from: "tenants",
            localField: "tenantIdObj",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, unitType: 1 } }],
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
            amount: { $ifNull: ["$postedAmount", { $ifNull: ["$providerConfirmedAmount", "$amount"] }] },
            providerConfirmedAmount: 1,
            postedAmount: 1,
            financialPostingStatus: 1,
            financialEffectsApplied: 1,
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

    const reversalRows = rawPayments.length
      ? await db.collection("financialLedger").find({
          kind: "PAYMENT_REVERSED",
          status: "posted",
          sourcePaymentId: { $in: identityValues(rawPayments.map((payment) => payment._id)) },
        }, { projection: { sourcePaymentId: 1, amount: 1 } }).toArray()
      : [];
    const reversedByPayment = new Map<string, number>();
    for (const reversal of reversalRows) {
      const key = String(reversal.sourcePaymentId);
      reversedByPayment.set(key, money((reversedByPayment.get(key) || 0) + Number(reversal.amount || 0)));
    }
    const payments = rawPayments.map((payment) => {
      if (!isSuccessfulPaymentStatus(payment.status)) return payment;
      const originalAmount = money(payment.amount);
      const reversedAmount = Math.min(originalAmount, reversedByPayment.get(String(payment._id)) || 0);
      const netAmount = money(Math.max(0, originalAmount - reversedAmount));
      return { ...payment, amount: netAmount, originalAmount, reversedAmount, netAmount };
    });

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




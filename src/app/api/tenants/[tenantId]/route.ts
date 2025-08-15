import { NextRequest, NextResponse } from "next/server";
import rateLimit from "express-rate-limit";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId, WithId } from "mongodb";
import bcrypt from "bcryptjs";
import { Tenant, ResponseTenant, TenantRequest } from "../../../../types/tenant";
import { Property } from "../../../../types/property";

// Logger
interface LogMeta {
  [key: string]: unknown;
}

const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[DEBUG] ${message}`, meta || "");
    }
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${message}`, meta || "");
    return { message, meta, level: "warn" };
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || "");
    return { message, meta, level: "error" };
  },
  info: (message: string, meta?: LogMeta) => {
    console.info(`[INFO] ${message}`, meta || "");
    return { message, meta, level: "info" };
  },
};

// Helper to convert potential string or Date to ISO string
const toISOStringSafe = (value: Date | string | undefined | null, field: string): string => {
  if (!value) {
    logger.warn(`Empty value for ${field}, returning empty string`, { value, field });
    return "";
  }
  try {
    if (typeof value === "string") {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      logger.warn(`Invalid date string for ${field}, returning original string`, { value, field });
      return value;
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString();
    }
    logger.warn(`Invalid Date object for ${field}, returning empty string`, { value, field });
    return "";
  } catch (error) {
    logger.error(`Error converting ${field} to ISO string`, {
      value,
      field,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return "";
  }
};

// Helper to extract client IP
const getClientIp = (request: NextRequest): string => {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim();
  }
  logger.warn("No client IP found in headers", {
    path: request.nextUrl.pathname,
    headers: Object.fromEntries(request.headers),
  });
  return "unknown";
};

// Rate limiter configuration
interface RateLimitRequest {
  ip: string;
  clientIp: string;
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface RateLimitResponse {
  statusCode: number;
  setHeader: () => void;
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: RateLimitRequest) => req.clientIp || "unknown",
});

// Apply rate limiter
const applyRateLimit = async (request: NextRequest): Promise<NextResponse | null> => {
  return new Promise((resolve) => {
    const mockReq: RateLimitRequest = {
      ip: getClientIp(request),
      clientIp: getClientIp(request),
      headers: Object.fromEntries(request.headers),
      method: request.method,
      url: request.nextUrl.pathname,
    };
    const mockRes: RateLimitResponse = {
      statusCode: 200,
      setHeader: () => {},
    };
    limiter(mockReq, mockRes, (err: Error | null) => {
      if (err || mockRes.statusCode === 429) {
        logger.warn("Rate limit exceeded", {
          path: request.nextUrl.pathname,
          clientIp: mockReq.clientIp,
        });
        resolve(
          NextResponse.json(
            { success: false, message: "Too many requests, please try again later" },
            { status: 429 }
          )
        );
      } else {
        resolve(null);
      }
    });
  });
};

// CSRF token validation
const validateCsrfToken = async (request: NextRequest, tenantId: string): Promise<boolean> => {
  const csrfToken = request.headers.get("x-csrf-token");
  const cookieStore = await cookies();
  const cookieCsrfToken = cookieStore.get("csrf-token")?.value;
  const requestTime = new Date().toISOString();
  logger.debug("CSRF Token Validation", {
    headerCsrfToken: csrfToken,
    cookieCsrfToken,
    path: request.nextUrl.pathname,
    tenantId,
    requestTime,
  });
  if (!csrfToken || !cookieCsrfToken) {
    logger.warn("CSRF token missing", {
      headerCsrfToken: csrfToken,
      cookieCsrfToken,
      path: request.nextUrl.pathname,
      tenantId,
      requestTime,
    });
    return false;
  }
  if (csrfToken !== cookieCsrfToken) {
    logger.warn("CSRF token mismatch", {
      headerCsrfToken: csrfToken,
      cookieCsrfToken,
      path: request.nextUrl.pathname,
      tenantId,
      requestTime,
    });
    return false;
  }
  logger.debug("CSRF token validated successfully", {
    headerCsrfToken: csrfToken,
    path: request.nextUrl.pathname,
    tenantId,
    requestTime,
  });
  return true;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const { tenantId } = await params;
  const url = new URL(request.url);
  const includeDues = url.searchParams.get("includeDues") === "true";
  const csrfToken = request.headers.get("x-csrf-token");

  if (!userId || !role || !["propertyOwner", "admin"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role, tenantId });
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!(await validateCsrfToken(request, tenantId))) {
    logger.error("Invalid CSRF token", {
      userId,
      tenantId,
      cookies: request.cookies.getAll(),
    });
    return NextResponse.json(
      { success: false, message: "Invalid CSRF token" },
      { status: 403 }
    );
  }

  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId)) {
    logger.error("Invalid tenantId or userId", { tenantId, userId });
    return NextResponse.json(
      { success: false, message: "Invalid tenant ID or user ID" },
      { status: 400 }
    );
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const startTime = Date.now();

    await db.collection<Tenant>("tenants").createIndex({ _id: 1, ownerId: 1 });
    await db.collection<Property>("properties").createIndex({ _id: 1, ownerId: 1 });

    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      logger.error("Tenant not found", { tenantId });
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(tenant.propertyId),
      ownerId: userId,
    }) as WithId<Property> | null;

    if (!property) {
      logger.error("Property not found or not owned", {
        propertyId: tenant.propertyId,
        userId,
      });
      return NextResponse.json(
        {
          success: false,
          message: "Property not found for this tenant or not owned by user",
        },
        { status: 404 }
      );
    }

    // Validate and update payment fields from payments collection
    const paymentTotals = await db
      .collection("payments")
      .aggregate([
        { $match: { tenantId: tenant._id.toString(), status: "completed" } },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    let totalRentPaid = 0,
      totalUtilityPaid = 0,
      totalDepositPaid = 0,
      walletBalance = tenant.walletBalance ?? 0;

    paymentTotals.forEach((p) => {
      if (p._id === "Rent") totalRentPaid = p.total;
      if (p._id === "Utility") totalUtilityPaid = p.total;
      if (p._id === "Deposit") totalDepositPaid = p.total;
      if (p._id === "Other") walletBalance += p.total;
    });

    if (
      tenant.totalRentPaid !== totalRentPaid ||
      tenant.totalUtilityPaid !== totalUtilityPaid ||
      tenant.totalDepositPaid !== totalDepositPaid ||
      tenant.walletBalance !== walletBalance
    ) {
      logger.warn("Payment field discrepancies detected, updating tenant", {
        tenantId,
        stored: {
          totalRentPaid: tenant.totalRentPaid,
          totalUtilityPaid: tenant.totalUtilityPaid,
          totalDepositPaid: tenant.totalDepositPaid,
          walletBalance: tenant.walletBalance,
        },
        calculated: {
          totalRentPaid,
          totalUtilityPaid,
          totalDepositPaid,
          walletBalance,
        },
      });

      await db.collection<Tenant>("tenants").updateOne(
        { _id: new ObjectId(tenantId) },
        {
          $set: {
            totalRentPaid,
            totalUtilityPaid,
            totalDepositPaid,
            walletBalance,
            updatedAt: new Date(),
          },
        }
      );
    }

    // Build tenant data
    let tenantData: ResponseTenant = {
      _id: tenant._id.toString(),
      ownerId: tenant.ownerId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      role: tenant.role,
      propertyId: tenant.propertyId,
      unitType: tenant.unitType,
      price: tenant.price,
      deposit: tenant.deposit,
      houseNumber: tenant.houseNumber,
      leaseStartDate: tenant.leaseStartDate,
      leaseEndDate: tenant.leaseEndDate,
      status: tenant.status,
      paymentStatus: tenant.paymentStatus,
      createdAt: toISOStringSafe(tenant.createdAt, "tenant.createdAt"),
      updatedAt: toISOStringSafe(tenant.updatedAt, "tenant.updatedAt"),
      totalRentPaid,
      totalUtilityPaid,
      totalDepositPaid,
      walletBalance,
    };

    // Fetch dues if requested
    if (includeDues) {
      if (!csrfToken) {
        logger.error("CSRF token missing for check-dues request", {
          tenantId,
          userId,
        });
        return NextResponse.json(
          { success: false, message: "CSRF token required for dues check" },
          { status: 403 }
        );
      }

      try {
        const cookieHeader = request.headers.get("cookie") || "";
        const checkDuesResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/tenants/check-dues`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
              Cookie: cookieHeader,
            },
            credentials: "include",
            body: JSON.stringify({
              tenantId,
              userId,
            }),
          }
        );

        const checkDuesData = await checkDuesResponse.json();

        if (!checkDuesData.success) {
          logger.error("Failed to fetch dues from check-dues API", {
            tenantId,
            userId,
            message: checkDuesData.message,
            status: checkDuesResponse.status,
          });
          return NextResponse.json(
            {
              success: false,
              message: checkDuesData.message || "Failed to fetch dues",
            },
            { status: checkDuesResponse.status }
          );
        }

        tenantData = {
          ...tenantData,
          paymentStatus: checkDuesData.tenant.paymentStatus,
          updatedAt: toISOStringSafe(checkDuesData.tenant.updatedAt, "checkDues.tenant.updatedAt"),
          dues: checkDuesData.dues,
        };
      } catch (error) {
        logger.error("Error calling check-dues API", {
          tenantId,
          userId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        return NextResponse.json(
          { success: false, message: "Failed to fetch dues from check-dues API" },
          { status: 500 }
        );
      }
    }

    const propertyData = {
      _id: property._id.toString(),
      name: property.name,
      createdAt: toISOStringSafe(property.createdAt, "property.createdAt"),
      updatedAt: toISOStringSafe(property.updatedAt, "property.updatedAt"),
    };

    logger.info("Tenant data fetched successfully", {
      tenantId,
      userId,
      includeDues,
      walletBalance: tenantData.walletBalance,
      totalRentPaid: tenantData.totalRentPaid,
      totalUtilityPaid: tenantData.totalUtilityPaid,
      totalDepositPaid: tenantData.totalDepositPaid,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      tenant: tenantData,
      property: propertyData,
    });
  } catch (error: unknown) {
    logger.error("Error in GET /api/tenants/[tenantId]", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
      role,
      tenantId,
      includeDues,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { tenantId } = await params;
  if (!tenantId || !ObjectId.isValid(tenantId)) {
    logger.warn("Invalid tenantId", { tenantId });
    return NextResponse.json(
      { success: false, message: "Invalid or missing tenant ID" },
      { status: 400 }
    );
  }

  if (!(await validateCsrfToken(request, tenantId))) {
    logger.warn("Invalid CSRF token", { path: request.nextUrl.pathname, tenantId });
    return NextResponse.json(
      { success: false, message: "Invalid or missing CSRF token" },
      { status: 403 }
    );
  }

  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      logger.warn("Unauthorized", { userId, role, tenantId });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const requestData: Partial<TenantRequest> = await request.json();
    logger.debug("PUT /api/tenants/[tenantId] - Request body", { requestData, tenantId });

    // Input validation
    const errors: { [key: string]: string } = {};
    if (requestData.name && !requestData.name.trim()) {
      errors.name = "Name cannot be empty";
    }
    if (requestData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestData.email)) {
      errors.email = "Invalid email format";
    }
    if (requestData.phone && !/^\+?\d{10,15}$/.test(requestData.phone)) {
      errors.phone = "Invalid phone number (10-15 digits, optional +)";
    }
    if (requestData.houseNumber && !requestData.houseNumber.trim()) {
      errors.houseNumber = "House number cannot be empty";
    }
    if (requestData.leaseStartDate && isNaN(Date.parse(requestData.leaseStartDate))) {
      errors.leaseStartDate = "Invalid lease start date";
    }
    if (requestData.leaseEndDate && isNaN(Date.parse(requestData.leaseEndDate))) {
      errors.leaseEndDate = "Invalid lease end date";
    }
    if (
      requestData.leaseStartDate &&
      requestData.leaseEndDate &&
      new Date(requestData.leaseEndDate) <= new Date(requestData.leaseStartDate)
    ) {
      errors.leaseEndDate = "Lease end date must be after start date";
    }
    if (requestData.price && (isNaN(Number(requestData.price)) || Number(requestData.price) < 0)) {
      errors.price = "Price must be a non-negative number";
    }
    if (requestData.deposit && (isNaN(Number(requestData.deposit)) || Number(requestData.deposit) < 0)) {
      errors.deposit = "Deposit must be a non-negative number";
    }
    if (
      requestData.totalRentPaid &&
      (isNaN(Number(requestData.totalRentPaid)) || Number(requestData.totalRentPaid) < 0)
    ) {
      errors.totalRentPaid = "Total rent paid must be a non-negative number";
    }
    if (
      requestData.totalUtilityPaid &&
      (isNaN(Number(requestData.totalUtilityPaid)) || Number(requestData.totalUtilityPaid) < 0)
    ) {
      errors.totalUtilityPaid = "Total utility paid must be a non-negative number";
    }
    if (
      requestData.totalDepositPaid &&
      (isNaN(Number(requestData.totalDepositPaid)) || Number(requestData.totalDepositPaid) < 0)
    ) {
      errors.totalDepositPaid = "Total deposit paid must be a non-negative number";
    }
    if (
      requestData.walletBalance &&
      (isNaN(Number(requestData.walletBalance)) || Number(requestData.walletBalance) < 0)
    ) {
      errors.walletBalance = "Wallet balance must be a non-negative number";
    }
    if (requestData.status && !["Active", "Pending", "Inactive"].includes(requestData.status)) {
      errors.status = "Invalid status value";
    }
    if (requestData.paymentStatus && !["current", "overdue"].includes(requestData.paymentStatus)) {
      errors.paymentStatus = "Invalid payment status value";
    }
    if (requestData.role && requestData.role !== "tenant") {
      errors.role = "Role must be 'tenant'";
    }

    if (Object.keys(errors).length > 0) {
      logger.warn("Validation errors", { errors, tenantId });
      return NextResponse.json({ success: false, message: "Validation errors", errors }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collection: "tenants" });

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    }) as WithId<Tenant> | null;

    if (!tenant) {
      logger.warn("Tenant lookup failed", { tenantId, userId });
      return NextResponse.json(
        { success: false, message: "Tenant not found or not owned by user" },
        { status: 404 }
      );
    }

    const updatableFields: (keyof TenantRequest)[] = [
      "name",
      "email",
      "phone",
      "password",
      "propertyId",
      "unitType",
      "price",
      "deposit",
      "houseNumber",
      "leaseStartDate",
      "leaseEndDate",
      "status",
      "paymentStatus",
      "totalRentPaid",
      "totalUtilityPaid",
      "totalDepositPaid",
      "walletBalance",
    ];

    const updateData: Partial<Tenant> = {};
    for (const field of updatableFields) {
      const value = requestData[field];
      if (value !== undefined) {
        if (
          field === "price" ||
          field === "deposit" ||
          field === "totalRentPaid" ||
          field === "totalUtilityPaid" ||
          field === "totalDepositPaid" ||
          field === "walletBalance"
        ) {
          const numericValue = typeof value === "string" ? Number(value) : value;
          if (isNaN(numericValue) || numericValue < 0) {
            logger.warn(`Invalid ${field}`, { value, tenantId });
            return NextResponse.json(
              { success: false, message: `${field} must be a non-negative number` },
              { status: 400 }
            );
          }
          updateData[field] = numericValue as never;
        } else if (field === "password" && value) {
          updateData[field] = await bcrypt.hash(value as string, 10);
        } else {
          updateData[field] = value as never;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      logger.warn("No fields provided for update", { tenantId });
      return NextResponse.json(
        { success: false, message: "No fields provided for update" },
        { status: 400 }
      );
    }

    if (updateData.unitType || updateData.propertyId) {
      const propertyId = updateData.propertyId || tenant.propertyId;
      if (!ObjectId.isValid(propertyId)) {
        logger.warn("Invalid propertyId", { propertyId, tenantId });
        return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
      }
      const property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(propertyId),
        ownerId: userId,
      });
      if (!property) {
        logger.warn("Property not found", { propertyId, tenantId });
        return NextResponse.json(
          { success: false, message: "Property not found or not owned by user" },
          { status: 404 }
        );
      }
      const unitType = updateData.unitType || tenant.unitType;
      const unit = property.unitTypes.find((u) => u.uniqueType === unitType);
      if (!unit) {
        logger.warn("Unit type not found", { unitType, tenantId });
        return NextResponse.json({ success: false, message: "Unit type not found" }, { status: 400 });
      }
      if (
        (updateData.price !== undefined && updateData.price !== unit.price) ||
        (updateData.deposit !== undefined && updateData.deposit !== unit.deposit)
      ) {
        logger.warn("Price or deposit mismatch", {
          requestedPrice: updateData.price,
          unitPrice: unit.price,
          requestedDeposit: updateData.deposit,
          unitDeposit: unit.deposit,
          tenantId,
        });
        return NextResponse.json(
          { success: false, message: "Price or deposit does not match unit type" },
          { status: 400 }
        );
      }
      updateData.price = updateData.price ?? unit.price;
      updateData.deposit = updateData.deposit ?? unit.deposit;
    }

    updateData.updatedAt = new Date();
    const updatedTenant = await db.collection<Tenant>("tenants").findOneAndUpdate(
      {
        _id: new ObjectId(tenantId),
        ownerId: userId,
      },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!updatedTenant) {
      logger.warn("Failed to update tenant", { tenantId });
      return NextResponse.json(
        { success: false, message: "Failed to update tenant" },
        { status: 404 }
      );
    }

    logger.info("Tenant updated", { tenantId, updatedFields: Object.keys(updateData) });
    return NextResponse.json(
      {
        success: true,
        message: "Tenant updated successfully",
        tenant: {
          _id: updatedTenant._id.toString(),
          ownerId: updatedTenant.ownerId,
          name: updatedTenant.name,
          email: updatedTenant.email,
          phone: updatedTenant.phone,
          role: updatedTenant.role,
          propertyId: updatedTenant.propertyId,
          unitType: updatedTenant.unitType,
          price: updatedTenant.price,
          deposit: updatedTenant.deposit,
          houseNumber: updatedTenant.houseNumber,
          leaseStartDate: updatedTenant.leaseStartDate,
          leaseEndDate: updatedTenant.leaseEndDate,
          status: updatedTenant.status,
          paymentStatus: updatedTenant.paymentStatus,
          createdAt: toISOStringSafe(updatedTenant.createdAt, "updatedTenant.createdAt"),
          updatedAt: toISOStringSafe(updatedTenant.updatedAt, "updatedTenant.updatedAt"),
          totalRentPaid: updatedTenant.totalRentPaid ?? 0,
          totalUtilityPaid: updatedTenant.totalUtilityPaid ?? 0,
          totalDepositPaid: updatedTenant.totalDepositPaid ?? 0,
          walletBalance: updatedTenant.walletBalance ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Error in PUT /api/tenants/[tenantId]", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      tenantId,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { tenantId } = await params;
  if (!tenantId || !ObjectId.isValid(tenantId)) {
    logger.warn("Invalid tenantId", { tenantId });
    return NextResponse.json(
      { success: false, message: "Invalid or missing tenant ID" },
      { status: 400 }
    );
  }

  if (!(await validateCsrfToken(request, tenantId))) {
    logger.warn("Invalid CSRF token", { path: request.nextUrl.pathname, tenantId });
    return NextResponse.json(
      { success: false, message: "Invalid or missing CSRF token" },
      { status: 403 }
    );
  }

  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      logger.warn("Unauthorized", { userId, role, tenantId });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collection: "tenants" });

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    }) as WithId<Tenant> | null;

    if (!tenant) {
      logger.warn("Tenant lookup failed", { tenantId, userId });
      return NextResponse.json(
        { success: false, message: "Tenant not found or not owned by user" },
        { status: 404 }
      );
    }

    // Check for pending invoices before deletion
    const pendingInvoices = await db.collection("invoices").countDocuments({
      tenantId: tenant._id.toString(),
      status: "pending",
    });

    if (pendingInvoices > 0) {
      logger.warn("Cannot delete tenant with pending invoices", { tenantId, pendingInvoices });
      return NextResponse.json(
        { success: false, message: "Cannot delete tenant with pending invoices" },
        { status: 400 }
      );
    }

    // Delete all payments associated with the tenant
    const paymentDeleteResult = await db.collection("payments").deleteMany({
      tenantId: tenant._id.toString(),
    });

    logger.info("Payments deleted for tenant", {
      tenantId,
      deletedCount: paymentDeleteResult.deletedCount,
    });

    const deleteResult = await db.collection<Tenant>("tenants").deleteOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (deleteResult.deletedCount === 0) {
      logger.warn("Failed to delete tenant", { tenantId });
      return NextResponse.json(
        { success: false, message: "Failed to delete tenant" },
        { status: 404 }
      );
    }

    // Update property unit quantity
    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(tenant.propertyId), "unitTypes.uniqueType": tenant.unitType },
      { $inc: { "unitTypes.$.quantity": 1 } }
    );
    logger.debug("Updated property unit quantity", { propertyId: tenant.propertyId, unitType: tenant.unitType });

    logger.info("Tenant deleted successfully", { tenantId });
    return NextResponse.json(
      {
        success: true,
        message: "Tenant and associated payments deleted successfully",
        deletedPaymentsCount: paymentDeleteResult.deletedCount,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Error in DELETE /api/tenants/[tenantId]", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      tenantId,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
// src/app/api/tenants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { TenantRequest, ResponseTenant } from "../../../types/tenant";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../../../lib/email";
import { sendWelcomeSms } from "../../../lib/sms";
import { sendWhatsAppMessage } from "../../../lib/whatsapp";

interface UnitType {
  type: string;
  price: number;
  uniqueType: string;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  managementFee: number;
  quantity: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
  unitTypes: UnitType[];
  rentPaymentDate: number;
  requiresAdminApproval?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

interface Tenant {
  _id: ObjectId;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt?: Date;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
}

interface LogMeta {
  [key: string]: unknown;
}

// Define MongoDB query type
interface MongoQuery {
  ownerId: string;
  name?: { $regex: string; $options: string };
  email?: { $regex: string; $options: string };
  propertyId?: string;
  unitType?: { $regex: string; $options: string };
}

const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[DEBUG] ${message}`, meta || "");
    }
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${message}`, meta || "");
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || "");
  },
  info: (message: string, meta?: LogMeta) => {
    console.info(`[INFO] ${message}`, meta || "");
  },
};

// Middleware to validate CSRF token
const validateCsrfToken = async (request: NextRequest): Promise<boolean> => {
  const csrfToken = request.headers.get("x-csrf-token");
  const cookieStore = await cookies();
  const cookieCsrfToken = cookieStore.get("csrf-token")?.value;

  logger.debug("CSRF Token Validation", {
    headerCsrfToken: csrfToken,
    cookieCsrfToken,
    path: request.nextUrl.pathname,
  });

  if (!csrfToken || !cookieCsrfToken) {
    logger.warn("CSRF token missing", {
      headerCsrfToken: csrfToken,
      cookieCsrfToken,
      path: request.nextUrl.pathname,
    });
    return false;
  }

  if (csrfToken !== cookieCsrfToken) {
    logger.warn("CSRF token mismatch", {
      headerCsrfToken: csrfToken,
      cookieCsrfToken,
      path: request.nextUrl.pathname,
    });
    return false;
  }

  return true;
};

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    logger.debug("GET /api/tenants - Cookies", { userId, role });

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      logger.warn("Unauthorized access attempt", { userId, role });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;
    const tenantName = searchParams.get("tenantName");
    const tenantEmail = searchParams.get("tenantEmail");
    const propertyId = searchParams.get("propertyId");
    const unitType = searchParams.get("unitType");

    const query: MongoQuery = { ownerId: userId };
    if (tenantName) query.name = { $regex: tenantName, $options: "i" };
    if (tenantEmail) query.email = { $regex: tenantEmail, $options: "i" };
    if (propertyId) query.propertyId = propertyId;
    if (unitType) query.unitType = { $regex: unitType, $options: "i" };

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collection: "tenants" });

    const totalTenants = await db.collection<Tenant>("tenants").countDocuments(query);
    const tenants = await db
      .collection<Tenant>("tenants")
      .find(query)
      .skip(skip)
      .limit(limit)
      .toArray();
    logger.debug("Fetched tenants", { userId, count: tenants.length, page, limit, query });

    return NextResponse.json(
      {
        success: true,
        tenants: tenants.map((tenant): ResponseTenant => ({
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
          status: tenant.status || "active",
          paymentStatus: tenant.paymentStatus || "inactive",
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt
            ? tenant.updatedAt instanceof Date
              ? tenant.updatedAt.toISOString()
              : typeof tenant.updatedAt === "string"
                ? tenant.updatedAt
                : undefined
            : undefined,
          totalRentPaid: tenant.totalRentPaid ?? 0,
          totalUtilityPaid: tenant.totalUtilityPaid ?? 0,
          totalDepositPaid: tenant.totalDepositPaid ?? 0,
          walletBalance: tenant.walletBalance ?? 0,
        })),
        total: totalTenants,
        page,
        limit,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Error in GET /api/tenants", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrfToken(request))) {
      logger.warn("Invalid CSRF token", { path: request.nextUrl.pathname });
      return NextResponse.json(
        { success: false, message: "Invalid or missing CSRF token" },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId)) {
      logger.warn("Invalid or missing user ID", { userId });
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      logger.warn("Unauthorized access attempt", { role });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const requestData: TenantRequest = await request.json();
    logger.debug("POST /api/tenants - Request body", { requestData });

    const requiredFields = [
      "name",
      "email",
      "phone",
      "role",
      "propertyId",
      "unitType",
      "price",
      "deposit",
      "houseNumber",
      "leaseStartDate",
      "leaseEndDate",
    ];

    if (!requestData.password) {
      logger.warn("Validation failed - Missing password for new tenant");
      return NextResponse.json(
        { success: false, message: "Password is required for new tenants" },
        { status: 400 }
      );
    }

    for (const field of requiredFields) {
      if (!requestData[field as keyof TenantRequest]) {
        logger.warn(`Validation failed - Missing field: ${field}`);
        return NextResponse.json(
          { success: false, message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestData.email!)) {
      logger.warn("Validation failed - Invalid email format", { email: requestData.email });
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    if (!/^\+?\d{10,15}$/.test(requestData.phone!)) {
      logger.warn("Validation failed - Invalid phone format", { phone: requestData.phone });
      return NextResponse.json(
        { success: false, message: "Invalid phone number (10-15 digits, optional +)" },
        { status: 400 }
      );
    }

    if (isNaN(Date.parse(requestData.leaseStartDate!)) || isNaN(Date.parse(requestData.leaseEndDate!))) {
      logger.warn("Validation failed - Invalid date format");
      return NextResponse.json(
        { success: false, message: "Invalid lease start or end date format" },
        { status: 400 }
      );
    }

    if (new Date(requestData.leaseEndDate!) <= new Date(requestData.leaseStartDate!)) {
      logger.warn("Validation failed - Lease end date must be after start date");
      return NextResponse.json(
        { success: false, message: "Lease end date must be after start date" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(requestData.propertyId!)) {
      logger.warn("Validation failed - Invalid propertyId", { propertyId: requestData.propertyId });
      return NextResponse.json(
        { success: false, message: "Invalid property ID" },
        { status: 400 }
      );
    }

    if (requestData.price! < 0 || requestData.deposit! < 0) {
      logger.warn("Validation failed - Price or deposit cannot be negative", {
        price: requestData.price,
        deposit: requestData.deposit,
      });
      return NextResponse.json(
        { success: false, message: "Price or deposit cannot be negative" },
        { status: 400 }
      );
    }

    if (
      requestData.totalRentPaid !== undefined &&
      (isNaN(requestData.totalRentPaid) || requestData.totalRentPaid < 0)
    ) {
      logger.warn("Validation failed - Invalid totalRentPaid", { totalRentPaid: requestData.totalRentPaid });
      return NextResponse.json(
        { success: false, message: "Total rent paid must be a non-negative number" },
        { status: 400 }
      );
    }

    if (
      requestData.totalUtilityPaid !== undefined &&
      (isNaN(requestData.totalUtilityPaid) || requestData.totalUtilityPaid < 0)
    ) {
      logger.warn("Validation failed - Invalid totalUtilityPaid", { totalUtilityPaid: requestData.totalUtilityPaid });
      return NextResponse.json(
        { success: false, message: "Total utility paid must be a non-negative number" },
        { status: 400 }
      );
    }

    if (
      requestData.totalDepositPaid !== undefined &&
      (isNaN(requestData.totalDepositPaid) || requestData.totalDepositPaid < 0)
    ) {
      logger.warn("Validation failed - Invalid totalDepositPaid", { totalDepositPaid: requestData.totalDepositPaid });
      return NextResponse.json(
        { success: false, message: "Total deposit paid must be a non-negative number" },
        { status: 400 }
      );
    }

    if (
      requestData.walletBalance !== undefined &&
      (isNaN(requestData.walletBalance) || requestData.walletBalance < 0)
    ) {
      logger.warn("Validation failed - Invalid walletBalance", { walletBalance: requestData.walletBalance });
      return NextResponse.json(
        { success: false, message: "Wallet balance must be a non-negative number" },
        { status: 400 }
      );
    }

    if (requestData.status && !["active", "inactive", "pending"].includes(requestData.status)) {
      logger.warn("Validation failed - Invalid status", { status: requestData.status });
      return NextResponse.json(
        { success: false, message: "Status must be one of: active, inactive, pending" },
        { status: 400 }
      );
    }

    if (requestData.paymentStatus && !["up-to-date", "overdue", "inactive"].includes(requestData.paymentStatus)) {
      logger.warn("Validation failed - Invalid paymentStatus", { paymentStatus: requestData.paymentStatus });
      return NextResponse.json(
        { success: false, message: "Payment status must be one of: up-to-date, overdue, inactive" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collection: "tenants" });

    // Combine user and property validation into a single aggregate query
    const [validationResult] = await db.collection("propertyOwners").aggregate([
      {
        $match: { _id: new ObjectId(userId) },
      },
      {
        $lookup: {
          from: "properties",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$ownerId", userId] },
                    { $eq: ["$_id", new ObjectId(requestData.propertyId!)] },
                  ],
                },
              },
            },
          ],
          as: "properties",
        },
      },
      {
        $unwind: "$properties",
      },
      {
        $project: {
          property: "$properties",
        },
      },
    ]).toArray();

    if (!validationResult) {
      logger.warn("Validation failed - User or property not found", { userId, propertyId: requestData.propertyId });
      return NextResponse.json(
        { success: false, message: "User or property not found or not owned by user" },
        { status: 404 }
      );
    }

    const { property } = validationResult;

    if (property.requiresAdminApproval) {
      logger.warn("Property requires admin approval", { propertyId: requestData.propertyId });
      return NextResponse.json(
        { success: false, message: "Cannot add tenant to property requiring admin approval" },
        { status: 403 }
      );
    }

    const unit = property.unitTypes.find((u: UnitType) => u.uniqueType === requestData.unitType);
    if (!unit || unit.quantity <= 0) {
      logger.warn("Validation failed - Unit type not found or no available units", {
        unitType: requestData.unitType,
        availableUnitTypes: property.unitTypes.map((u: UnitType) => u.uniqueType),
      });
      return NextResponse.json(
        { success: false, message: "Unit type not found or no available units" },
        { status: 400 }
      );
    }

    if (requestData.price !== unit.price || requestData.deposit !== unit.deposit) {
      logger.warn("Validation failed - Price or deposit mismatch", {
        requestedPrice: requestData.price,
        unitPrice: unit.price,
        requestedDeposit: requestData.deposit,
        unitDeposit: unit.deposit,
      });
      return NextResponse.json(
        { success: false, message: "Price or deposit does not match unit type" },
        { status: 400 }
      );
    }

    // Check tenant count and invoice status in a single query if needed
    const tenantCount = await db.collection("tenants").countDocuments({ ownerId: userId });
    logger.debug("Tenant count", { userId, count: tenantCount });

    if (tenantCount >= 3) {
      const propertyInvoice = await db.collection("invoices").findOne({
        userId,
        propertyId: requestData.propertyId,
        unitType: "All Units",
        status: "completed",
      });

      if (!propertyInvoice) {
        logger.warn("Cannot add tenant - No completed invoice found for property", {
          propertyId: requestData.propertyId,
          propertyName: property.name,
        });
        return NextResponse.json(
          {
            success: false,
            message: `Cannot add more tenants to property '${property.name}' until the property management fee invoice is paid.`,
          },
          { status: 402 }
        );
      }
      logger.debug("Invoice validation passed", { propertyId: requestData.propertyId, invoiceId: propertyInvoice._id });
    }

    const tenantData: Tenant = {
      _id: new ObjectId(),
      ownerId: userId,
      name: requestData.name!,
      email: requestData.email!,
      phone: requestData.phone!,
      password: await bcrypt.hash(requestData.password!, 10),
      role: requestData.role!,
      propertyId: requestData.propertyId!,
      unitType: requestData.unitType!,
      price: requestData.price!,
      deposit: requestData.deposit!,
      houseNumber: requestData.houseNumber!,
      leaseStartDate: requestData.leaseStartDate!,
      leaseEndDate: requestData.leaseEndDate!,
      status: requestData.status || "active",
      paymentStatus: requestData.paymentStatus || "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
      totalRentPaid: requestData.totalRentPaid ?? 0,
      totalUtilityPaid: requestData.totalUtilityPaid ?? 0,
      totalDepositPaid: requestData.totalDepositPaid ?? 0,
      walletBalance: requestData.walletBalance ?? 0,
    };

    const insertStart = Date.now();
    const result = await db.collection("tenants").insertOne(tenantData);
    logger.debug("Tenant inserted", {
      tenantId: result.insertedId,
      duration: Date.now() - insertStart,
    });

    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(requestData.propertyId!), "unitTypes.uniqueType": requestData.unitType },
      { $inc: { "unitTypes.$.quantity": -1 } }
    );

    // Send welcome email
    try {
      await sendWelcomeEmail({
        to: requestData.email!,
        name: requestData.name!,
        email: requestData.email!,
        password: requestData.password!,
        loginUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}`,
        propertyName: property.name,
        houseNumber: requestData.houseNumber!,
      });
      logger.info("Welcome email sent successfully", { email: requestData.email });
    } catch (emailError) {
      logger.error("Failed to send welcome email", {
        email: requestData.email,
        error: emailError instanceof Error ? emailError.message : "Unknown error",
      });
      // Continue even if email fails to ensure tenant is added
    }

// Send welcome SMS — 100% safe under 160 chars
try {
  const name = requestData.name!.trim();
  const email = (requestData.email ?? "").trim();
  const password = (requestData.password ?? "").trim();
  const phone = requestData.phone?.trim();
  const house = requestData.houseNumber?.trim() || "";
  const propertyName = property.name.trim();

  if (!phone) {
    logger.warn("No phone number provided for welcome SMS", { tenant: requestData.email });
    throw new Error("Missing phone number");
  }

  // === SHORTEN PROPERTY NAME ===
  const maxPropLen = 18;
  const shortProp = propertyName.length > maxPropLen
    ? propertyName.slice(0, maxPropLen - 1) + "…"
    : propertyName;

  // === SHORT BASE URL ===
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.smartchoicerentalmanagement.com").trim();
  const shortUrl = baseUrl.length > 35 ? "https://app.scrm.co.ke" : baseUrl.replace(/^https?:\/\//, "");

  // === BUILD MESSAGE (PRIORITIZE 160 CHAR LIMIT) ===
  let message = `Hi ${name}! Login: ${shortUrl}\nEmail: ${email}\nPass: ${password}\nUnit: ${shortProp}${house ? " " + house : ""}`;

  // Fallback if still too long (ultra-safe)
  if (message.length > 160) {
    message = `Hi ${name}! Login at ${shortUrl}\nUse: ${email}\nPass: ${password}`;
  }

  // Final safety check
  if (message.length > 160) {
    message = message.slice(0, 157) + "...";
  }

  await sendWelcomeSms({
    phone,
    message,
  });

  logger.info("Welcome SMS sent", {
    phone,
    length: message.length,
    property: shortProp,
    url: shortUrl,
  });
} catch (smsError) {
  logger.error("Welcome SMS failed", {
    phone: requestData.phone,
    error: smsError instanceof Error ? smsError.message : smsError,
    stack: smsError instanceof Error ? smsError.stack : undefined,
  });
  // Non-blocking: tenant still gets created
}

// Send welcome WhatsApp message
try {
  const maxPropertyNameLength = 50; // Allow slightly longer names for WhatsApp messages
  const truncatedPropertyName =
    property.name.length > maxPropertyNameLength
      ? `${property.name.substring(0, maxPropertyNameLength)}...`
      : property.name;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const shortUrl =
    baseUrl.length > 30
      ? "https://app.smartchoicerentalmanagement.com/"
      : baseUrl;

  const whatsAppMessage = `Dear ${requestData.name},

We are pleased to inform you that you have been successfully registered as a tenant.  

Please log in to the Tenant Portal at ${shortUrl} using the following credentials:

• Email: ${requestData.email}  
• Password: ${requestData.password}  

Your assigned unit: ${truncatedPropertyName} ${requestData.houseNumber}.  

Contact us for any enquiries.

Best regards,  
${property.name} Management`;

  if (whatsAppMessage.length > 4096) {
    logger.warn("WhatsApp message exceeds 4096 characters", {
      phone: requestData.phone,
      messageLength: whatsAppMessage.length,
    });

    const fallbackMessage = `Dear ${requestData.name}, you have been successfully registered as a tenant. Login at ${shortUrl} using Email: ${requestData.email}.`;

    await sendWhatsAppMessage({
      phone: requestData.phone!,
      message: fallbackMessage,
    });
  } else {
    await sendWhatsAppMessage({
      phone: requestData.phone!,
      message: whatsAppMessage,
    });
  }

  logger.info("Welcome WhatsApp message sent successfully", {
    phone: requestData.phone,
  });
} catch (whatsAppError) {
  logger.error("Failed to send welcome WhatsApp message", {
    phone: requestData.phone,
    error:
      whatsAppError instanceof Error
        ? whatsAppError.message
        : "Unknown error",
  });
  // Proceed even if message sending fails to ensure tenant registration
}

    logger.info("POST /api/tenants completed");
    return NextResponse.json(
      {
        success: true,
        message: "Tenant added successfully",
        tenantId: result.insertedId.toString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error("Error in POST /api/tenants", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
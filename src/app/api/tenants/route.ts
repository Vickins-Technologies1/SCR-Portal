// lint-disable-next-line no-unused-vars
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { TenantRequest } from "../../../types/tenant";
import { getManagementFee } from "../../../lib/unitTypes";
import bcrypt from "bcryptjs";

interface UnitType {
  type: string;
  price: number;
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
  createdAt: Date;
}

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
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || "");
  },
  info: (message: string, meta?: LogMeta) => {
    console.info(`[INFO] ${message}`, meta || "");
  },
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

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collection: "tenants" });

    const totalTenants = await db.collection<Tenant>("tenants").countDocuments({ ownerId: userId });
    const tenants = await db
      .collection<Tenant>("tenants")
      .find({ ownerId: userId })
      .skip(skip)
      .limit(limit)
      .toArray();
    logger.debug("Fetched tenants", { userId, count: tenants.length, page, limit });

    return NextResponse.json(
      {
        success: true,
        tenants: tenants.map((tenant) => ({
          ...tenant,
          _id: tenant._id.toString(),
          createdAt: tenant.createdAt.toISOString(),
        })),
        total: totalTenants,
        page,
        limit,
      },
      { status: 200 }
    );
  } catch (error: unknown) { // Changed from any to unknown
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

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collection: "tenants" });

    const requiredFields = [
      "name",
      "email",
      "phone",
      "password",
      "role",
      "propertyId",
      "unitType",
      "price",
      "deposit",
      "houseNumber",
      "leaseStartDate",
      "leaseEndDate",
    ];
    for (const field of requiredFields) {
      if (!requestData[field as keyof TenantRequest]) {
        logger.warn(`Validation failed - Missing field: ${field}`);
        return NextResponse.json(
          { success: false, message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestData.email)) {
      logger.warn("Validation failed - Invalid email format", { email: requestData.email });
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    if (!/^\+?\d{10,15}$/.test(requestData.phone)) {
      logger.warn("Validation failed - Invalid phone format", { phone: requestData.phone });
      return NextResponse.json(
        { success: false, message: "Invalid phone number (10-15 digits, optional +)" },
        { status: 400 }
      );
    }

    if (isNaN(Date.parse(requestData.leaseStartDate)) || isNaN(Date.parse(requestData.leaseEndDate))) {
      logger.warn("Validation failed - Invalid date format");
      return NextResponse.json(
        { success: false, message: "Invalid lease start or end date format" },
        { status: 400 }
      );
    }
    if (new Date(requestData.leaseEndDate) <= new Date(requestData.leaseStartDate)) {
      logger.warn("Validation failed - Lease end date must be after start date");
      return NextResponse.json(
        { success: false, message: "Lease end date must be after start date" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(requestData.propertyId)) {
      logger.warn("Validation failed - Invalid propertyId", { propertyId: requestData.propertyId });
      return NextResponse.json(
        { success: false, message: "Invalid property ID" },
        { status: 400 }
      );
    }

    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(requestData.propertyId),
      ownerId: userId,
    });

    if (!property) {
      logger.warn("Validation failed - Property not found or not owned by user", { propertyId: requestData.propertyId });
      return NextResponse.json(
        { success: false, message: "Property not found or not owned by user" },
        { status: 404 }
      );
    }

    const unit = property.unitTypes.find((u) => u.type === requestData.unitType);
    if (!unit || unit.quantity <= 0) {
      logger.warn("Validation failed - Unit type not found or no available units", { unitType: requestData.unitType });
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

    const user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      logger.warn("User not found", { userId });
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const onboardingFee = getManagementFee({
      type: requestData.unitType,
      managementType: unit.managementType,
      quantity: 1,
    }) || 1000;
    logger.debug("Calculated onboarding fee", { unitType: requestData.unitType, onboardingFee });

    const tenantCount = await db.collection("tenants").countDocuments({ ownerId: userId });
    logger.debug("Tenant count", { userId, count: tenantCount });

    let invoice = null;
    if (tenantCount >= 3) {
      const pendingInvoices = await db.collection("invoices").find({
        userId,
        status: { $ne: "completed" },
      }).toArray();

      if (pendingInvoices.length > 0) {
        logger.warn("Cannot add tenant - Pending invoices found", { count: pendingInvoices.length });
        return NextResponse.json(
          { success: false, message: "Cannot add more tenants until all pending invoices are paid." },
          { status: 402 }
        );
      }

      if (user.paymentStatus !== "active" || user.walletBalance < onboardingFee) {
        logger.warn("Insufficient payment status or wallet balance", {
          paymentStatus: user.paymentStatus,
          walletBalance: user.walletBalance,
          requiredFee: onboardingFee,
        });
        return NextResponse.json(
          {
            success: false,
            message: `You need an active payment status and a minimum wallet balance of Ksh ${onboardingFee} to add more than 3 tenants.`,
          },
          { status: 402 }
        );
      }

      invoice = {
        userId,
        amount: onboardingFee,
        reference: `TENANT-INVOICE-${userId}-${Date.now()}`,
        status: "pending",
        createdAt: new Date(),
        description: `Tenant onboarding fee for ${requestData.name} in ${property.name}`,
      };
      await db.collection("invoices").insertOne(invoice);
      logger.debug("Generated invoice", {
        invoice,
      });
    }

    const tenantData = {
      ownerId: userId,
      name: requestData.name,
      email: requestData.email,
      phone: requestData.phone,
      password: await bcrypt.hash(requestData.password!, 10),
      role: "tenant",
      propertyId: requestData.propertyId,
      unitType: requestData.unitType,
      price: requestData.price,
      deposit: requestData.deposit,
      houseNumber: requestData.houseNumber,
      leaseStartDate: requestData.leaseStartDate,
      leaseEndDate: requestData.leaseEndDate,
      createdAt: new Date(),
    };

    const insertStart = Date.now();
    const result = await db.collection("tenants").insertOne(tenantData);
    logger.debug("Tenant inserted", {
      tenantId: result.insertedId,
      duration: Date.now() - insertStart,
    });

    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(requestData.propertyId), "unitTypes.type": requestData.unitType },
      { $inc: { "unitTypes.$.quantity": -1 } }
    );

    logger.info("POST /api/tenants completed");
    return NextResponse.json(
      {
        success: true,
        message: "Tenant added successfully",
        tenantId: result.insertedId.toString(),
        invoice: invoice
          ? {
              ...invoice,
              createdAt: invoice.createdAt.toISOString(),
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error: unknown) { // Changed from any to unknown
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
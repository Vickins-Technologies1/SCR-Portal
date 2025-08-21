import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { ResponseTenant } from "../../../types/tenant";

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
  managementFee?: number;
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
    logger.debug("GET /api/property-owner-data - Cookies", { userId, role });

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
    logger.debug("Connected to database", { database: "rentaldb" });

    const [user, tenants, totalTenants, properties, pendingInvoices] = await Promise.all([
      db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) }),
      db
        .collection<Tenant>("tenants")
        .find({ ownerId: userId })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<Tenant>("tenants").countDocuments({ ownerId: userId }),
      db.collection<Property>("properties").find({ ownerId: userId }).toArray(),
      db.collection("invoices").countDocuments({ userId, status: "pending" }),
    ]);

    if (!user) {
      logger.warn("User not found", { userId });
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    logger.debug("Fetched data", { userId, tenantCount: tenants.length, propertyCount: properties.length, pendingInvoices });

    return NextResponse.json(
      {
        success: true,
        user: {
          paymentStatus: user.paymentStatus || "inactive",
          walletBalance: user.walletBalance || 0,
        },
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
        totalTenants,
        properties: properties.map((p) => ({
          _id: p._id.toString(),
          ownerId: p.ownerId,
          name: p.name,
          unitTypes: p.unitTypes,
          rentPaymentDate: p.rentPaymentDate,
          requiresAdminApproval: p.requiresAdminApproval,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt ? p.updatedAt.toISOString() : undefined,
          managementFee: p.managementFee,
        })),
        pendingInvoices,
        page,
        limit,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Error in GET /api/property-owner-data", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
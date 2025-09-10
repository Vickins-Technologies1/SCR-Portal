import { NextRequest, NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import logger from "../../../lib/logger";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
};

// Interfaces
interface Payment {
  _id: ObjectId;
  tenantId: string | null;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber?: string;
  reference?: string;
  date?: string; // Optional, for backward compatibility
  tenantName?: string;
  unitType?: string;
  ownerId: string;
}

interface Property {
  _id: ObjectId;
  ownerId: string | ObjectId;
  name: string;
}

interface Report {
  _id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string | null;
  tenantName: string;
  revenue: number;
  date: string;
  status: string;
  ownerId: string;
  tenantPaymentStatus: string;
  unitType?: string;
  type: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Validate date string
const isValidDate = (dateString: string): boolean => {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}/.test(dateString)) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

// GET /api/reports
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Report[]>>> {
  const startTime = Date.now();
  try {
    // Read cookies from client request
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    logger.debug("GET /api/reports - Cookies", { userId, role });

    if (!userId || !ObjectId.isValid(userId)) {
      logger.error("Invalid user ID", { userId });
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      logger.error("Unauthorized access attempt", { userId, role });
      return NextResponse.json(
        { success: false, message: "Unauthorized: Please log in as a property owner." },
        { status: 401 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type");

    // Validate query parameters
    if (propertyId && propertyId !== "all" && !ObjectId.isValid(propertyId)) {
      logger.error("Invalid property ID", { propertyId });
      return NextResponse.json(
        { success: false, message: "Invalid property ID" },
        { status: 400 }
      );
    }

    if (startDate && !isValidDate(startDate)) {
      logger.error("Invalid start date", { startDate });
      return NextResponse.json(
        { success: false, message: "Invalid start date. Use YYYY-MM-DD format." },
        { status: 400 }
      );
    }

    if (endDate && !isValidDate(endDate)) {
      logger.error("Invalid end date", { endDate });
      return NextResponse.json(
        { success: false, message: "Invalid end date. Use YYYY-MM-DD format." },
        { status: 400 }
      );
    }

    // Validate date range
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      logger.error("End date is before start date", { startDate, endDate });
      return NextResponse.json(
        { success: false, message: "End date cannot be before start date." },
        { status: 400 }
      );
    }

    // DB Connection
    const db = await connectToDatabase();

    // Fetch properties owned by the user
    const properties = await db
      .collection<Property>("properties")
      .find(
        {
          $or: [{ ownerId: userId }, { ownerId: new ObjectId(userId) }],
        },
        { projection: { _id: 1, name: 1 } }
      )
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());

    if (!propertyIds.length) {
      logger.debug("No properties found for propertyOwner", { userId });
      return NextResponse.json({ success: true, data: [] }, { status: 200 });
    }

    // Build payment query
    const paymentQuery: {
      propertyId: { $in: string[] } | string;
      paymentDate?: { $gte?: string; $lte?: string };
      status?: string;
      type?: string;
    } = {
      propertyId: propertyId && propertyId !== "all" ? propertyId : { $in: propertyIds },
      status: "completed",
    };

    if (startDate || endDate) {
      paymentQuery.paymentDate = {};
      if (startDate) {
        paymentQuery.paymentDate.$gte = new Date(startDate).toISOString();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        paymentQuery.paymentDate.$lte = end.toISOString();
      }
    }

    if (type && type !== "all") {
      paymentQuery.type = type;
    }

    // Fetch payments with tenant and property information
    const payments = await db
      .collection<Payment>("payments")
      .aggregate([
        { $match: paymentQuery },
        { $sort: { paymentDate: -1 } },
        {
          $lookup: {
            from: "tenants",
            let: { tenantId: { $toObjectId: "$tenantId" } },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$tenantId"] } } },
              { $project: { name: 1, paymentStatus: 1, unitType: 1 } },
            ],
            as: "tenant",
          },
        },
        { $unwind: { path: "$tenant", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "properties",
            let: { propertyId: { $toObjectId: "$propertyId" } },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$propertyId"] } } },
              { $project: { name: 1 } },
            ],
            as: "property",
          },
        },
        { $unwind: { path: "$property", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: { $toString: "$_id" },
            propertyId: { $toString: "$propertyId" },
            propertyName: { $ifNull: ["$property.name", "Unassigned"] },
            tenantId: { $ifNull: ["$tenantId", null] },
            tenantName: { $ifNull: ["$tenant.name", "$tenantName", "Unknown"] },
            revenue: "$amount",
            date: {
              $cond: [
                {
                  $and: [
                    "$paymentDate",
                    { $ne: ["$paymentDate", ""] },
                    { $regexMatch: { input: { $toString: "$paymentDate" }, regex: /^\d{4}-\d{2}-\d{2}/ } },
                  ],
                },
                { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$paymentDate" } } },
                { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$createdAt" } } },
              ],
            },
            status: "$status",
            ownerId: userId,
            tenantPaymentStatus: { $ifNull: ["$tenant.paymentStatus", "Unknown"] },
            unitType: { $ifNull: ["$tenant.unitType", "$unitType", "N/A"] },
            type: { $ifNull: ["$type", "Unknown"] },
          },
        },
        {
          $match: {
            date: { $regex: /^\d{4}-\d{2}-\d{2}$/, $ne: "" },
          },
        },
      ])
      .toArray() as Report[];

    // Log payments with missing unitType for debugging
    const missingUnitTypePayments = payments.filter((p) => p.unitType === "N/A" && propertyId && propertyId !== "all");
    if (missingUnitTypePayments.length > 0) {
      logger.warn("Payments with missing unitType found", {
        propertyId: propertyId || "all",
        missingUnitTypePayments: missingUnitTypePayments.map((p) => ({ _id: p._id, tenantId: p.tenantId })),
      });
    }

    logger.info("Reports fetched successfully", {
      userId,
      propertyId: propertyId || "all",
      startDate,
      endDate,
      type: type || "all",
      reportCount: payments.length,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json({ success: true, data: payments }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Error fetching reports", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json(
      { success: false, message: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
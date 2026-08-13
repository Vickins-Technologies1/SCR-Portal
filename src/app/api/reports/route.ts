// src/app/api/reports/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import logger from "../../../lib/logger";
import {
  buildAvailableYears,
  buildRollingPeriods,
  filterPropertiesBySnapshot,
  formatPeriodLabel,
  getMonthEndSnapshot,
  summarizePropertyPerformance,
  type PropertyPerformanceProperty,
} from "@/lib/property-report";
import { fetchTenantsActiveOnDay } from "@/lib/tenant-occupancy";

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
  mpesaCode?: string;
  isManual?: boolean;
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
  reference?: string;
  transactionId?: string;
  mpesaCode?: string;
  isManual?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface PropertyReportResponse {
  period: {
    year: number;
    month: number;
    label: string;
    snapshotDate: string;
  };
  summary: {
    totalProperties: number;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
    vacancyRate: number;
  };
  properties: Array<{
    propertyId: string;
    propertyName: string;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
    vacancyRate: number;
    statusLabel: string;
    statusTone: "success" | "warning" | "danger" | "neutral";
  }>;
  trend: {
    labels: string[];
    occupancyRates: number[];
    vacancyRates: number[];
    occupiedUnits: number[];
    vacantUnits: number[];
    totalUnits: number[];
  };
  availableYears: number[];
  basisNote: string;
}

// Validate date string
const isValidDate = (dateString: string): boolean => {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}/.test(dateString)) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

// GET /api/reports
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Report[] | PropertyReportResponse>>> {
  const startTime = Date.now();
  try {
    // Read cookies from client request
    const loggedInUserId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    logger.debug("GET /api/reports - Cookies", { loggedInUserId, role });

    if (!loggedInUserId || !ObjectId.isValid(loggedInUserId)) {
      logger.error("Invalid user ID", { loggedInUserId });
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    let effectiveOwnerId = loggedInUserId;

    if (role === "teamMember") {
      const db = await connectToDatabase();
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
    } else if (role !== "propertyOwner") {
      logger.error("Unauthorized access attempt", { loggedInUserId, role });
      return NextResponse.json(
        { success: false, message: "Unauthorized: Please log in as a property owner." },
        { status: 401 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("reportType");
    const propertyId = searchParams.get("propertyId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type");

    if (reportType === "properties") {
      const month = Number(searchParams.get("month") || new Date().getUTCMonth() + 1);
      const year = Number(searchParams.get("year") || new Date().getUTCFullYear());

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { success: false, message: "month must be between 1 and 12" },
          { status: 400 }
        );
      }

      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return NextResponse.json(
          { success: false, message: "year is out of range" },
          { status: 400 }
        );
      }

      const db = await connectToDatabase();
      let effectiveOwnerId = loggedInUserId;
      let assignedPropertyIds: string[] | null = null;

      if (role === "teamMember") {
        const teamMember = await db.collection("teamMembers").findOne({
          _id: new ObjectId(loggedInUserId),
          active: true,
        });

        if (!teamMember || !teamMember.ownerId) {
          return NextResponse.json(
            { success: false, message: "Unauthorized: No property owner assigned" },
            { status: 403 }
          );
        }

        effectiveOwnerId = teamMember.ownerId.toString();
        assignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
          ? Array.from(
              new Set(
                (teamMember as any).assignedPropertyIds
                  .map((value: any) => String(value || "").trim())
                  .filter((value: string) => ObjectId.isValid(value))
              )
            )
          : null;
      }

      const propertiesQuery: Record<string, unknown> = {
        $or: [{ ownerId: effectiveOwnerId }, { ownerId: new ObjectId(effectiveOwnerId) }],
      };
      if (role === "teamMember" && assignedPropertyIds && assignedPropertyIds.length > 0) {
        propertiesQuery._id = { $in: assignedPropertyIds.map((id) => new ObjectId(id)) };
      }

      const properties = await db
        .collection<PropertyPerformanceProperty>("properties")
        .find(propertiesQuery)
        .toArray();

      const selectedSnapshot = getMonthEndSnapshot(year, month);
      const selectedLabel = formatPeriodLabel(year, month);
      const selectedProperties = filterPropertiesBySnapshot(properties, selectedSnapshot);
      const selectedPropertyIds = selectedProperties.map((property) => property._id.toString());

      const selectedTenants = selectedPropertyIds.length
        ? await fetchTenantsActiveOnDay(db, selectedPropertyIds, selectedSnapshot, {
            propertyId: 1,
            leasedUnits: 1,
            unitIdentifier: 1,
            unitType: 1,
          })
        : [];

      const selectedSummary = summarizePropertyPerformance(selectedProperties, selectedTenants as any);
      const rollingPeriods = buildRollingPeriods(year, month, 6);

      const trendResults = await Promise.all(
        rollingPeriods.map(async (period) => {
          const periodProperties = filterPropertiesBySnapshot(properties, period.snapshot);
          const periodPropertyIds = periodProperties.map((property) => property._id.toString());
          const periodTenants = periodPropertyIds.length
            ? await fetchTenantsActiveOnDay(db, periodPropertyIds, period.snapshot, {
                propertyId: 1,
                leasedUnits: 1,
                unitIdentifier: 1,
                unitType: 1,
              })
            : [];

          const periodSummary = summarizePropertyPerformance(periodProperties, periodTenants as any);
          return {
            label: period.label,
            occupancyRate: periodSummary.summary.occupancyRate,
            vacancyRate: periodSummary.summary.vacancyRate,
            occupiedUnits: periodSummary.summary.occupiedUnits,
            vacantUnits: periodSummary.summary.vacantUnits,
            totalUnits: periodSummary.summary.totalUnits,
          };
        })
      );

      const report: PropertyReportResponse = {
        period: {
          year,
          month,
          label: selectedLabel,
          snapshotDate: selectedSnapshot.toISOString(),
        },
        summary: selectedSummary.summary,
        properties: selectedSummary.properties,
        trend: {
          labels: trendResults.map((item) => item.label),
          occupancyRates: trendResults.map((item) => item.occupancyRate),
          vacancyRates: trendResults.map((item) => item.vacancyRate),
          occupiedUnits: trendResults.map((item) => item.occupiedUnits),
          vacantUnits: trendResults.map((item) => item.vacantUnits),
          totalUnits: trendResults.map((item) => item.totalUnits),
        },
        availableYears: buildAvailableYears(properties, new Date().getUTCFullYear()),
        basisNote:
          "Historical occupancy is calculated from lease start and end dates for properties that existed by the selected month-end. Unit totals use the current property configuration because historical unit snapshots are not stored.",
      };

      return NextResponse.json({ success: true, report });
    }

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

    // Fetch properties owned by the effective owner
    const properties = await db
      .collection<Property>("properties")
      .find(
        {
          $or: [{ ownerId: effectiveOwnerId }, { ownerId: new ObjectId(effectiveOwnerId) }],
        },
        { projection: { _id: 1, name: 1 } }
      )
      .toArray();
    const propertyIds = properties.map((p) => p._id.toString());

    if (!propertyIds.length) {
      logger.debug("No properties found for propertyOwner", { effectiveOwnerId });
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
            transactionId: 1,
            reference: 1,
            mpesaCode: 1,
            isManual: 1,
            ownerId: effectiveOwnerId,
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
      userId: loggedInUserId,
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

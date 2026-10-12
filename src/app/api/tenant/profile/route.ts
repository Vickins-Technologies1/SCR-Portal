import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import { calculateTenantRentDueToDate, resolveTenantMonthlyRentForDate } from "../../../../lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { getFinancialPaymentRows } from "@/lib/financial-reporting";

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
  unitIdentifier?: string;
  leasedUnits?: Array<{
    unitIdentifier: string;
    unitType: string;
    houseNumber: string;
    price: number;
    deposit: number;
  }>;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: Date;
  updatedAt?: Date | string;
  walletBalance: number;
  status?: string;
  paymentStatus?: string;
  totalRentPaid?: number;
  totalUtilityPaid?: number;
  totalDepositPaid?: number;
}

async function getMonthlyPayments(
  db: Db,
  targetTenantId: string,
  monthsStayed: number
): Promise<Array<{
  month: string;
  rent: number;
  utility: number;
  deposit: number;      // ← new field
  total: number;
  paid: boolean;
}>> {
  const monthlyMap: Record<
    string,
    { rent: number; utility: number; deposit: number; total: number }
  > = {};
  const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" });
  const monthKeyFor = (date: Date) => {
    const parts = monthFormatter.formatToParts(date);
    return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
  };
  const rows = await getFinancialPaymentRows({ db, tenantIds: [targetTenantId] });
  rows.forEach(({ eventDate, netAmount, allocation }) => {
    if (!eventDate) return;
    const monthKey = monthKeyFor(eventDate);
    if (!monthlyMap[monthKey]) {
      monthlyMap[monthKey] = { rent: 0, utility: 0, deposit: 0, total: 0 };
    }
    monthlyMap[monthKey].rent += allocation.rent;
    monthlyMap[monthKey].utility += allocation.utilities;
    monthlyMap[monthKey].deposit += allocation.deposit;
    monthlyMap[monthKey].total += netAmount;
  });

  const monthlyPayments: Array<{
    month: string;
    rent: number;
    utility: number;
    deposit: number;
    total: number;
    paid: boolean;
  }> = [];

  const today = new Date();
  const todayParts = monthFormatter.formatToParts(today);
  const currentYear = Number(todayParts.find((part) => part.type === "year")?.value);
  const currentMonth = Number(todayParts.find((part) => part.type === "month")?.value) - 1;

  for (let i = 0; i < Math.min(12, monthsStayed || 12); i++) {
    const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
    const monthKey = monthKeyFor(date);
    const monthName = date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "Africa/Nairobi" });

    const data = monthlyMap[monthKey] || { rent: 0, utility: 0, deposit: 0, total: 0 };

    monthlyPayments.push({
      month: monthName,
      rent: data.rent,
      utility: data.utility,
      deposit: data.deposit,     // now visible separately if you want
      total: data.total,
      paid: data.total > 0,
    });
  }

  // Oldest to newest (left → right on chart)
  return monthlyPayments;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    const impersonatingTenantId = cookieStore.get("impersonatingTenantId")?.value;
    const isImpersonating = cookieStore.get("isImpersonating")?.value === "true";

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    let targetTenantId = userId;
    let shouldCalculateDues = false;

    if (
      isImpersonating &&
      impersonatingTenantId &&
      ObjectId.isValid(impersonatingTenantId) &&
      role === "propertyOwner"
    ) {
      const tenantCheck = await db.collection("tenants").findOne({
        _id: new ObjectId(impersonatingTenantId),
        ownerId: userId,
      });

      if (!tenantCheck) {
        return NextResponse.json(
          { success: false, message: "Unauthorized to view this tenant" },
          { status: 403 }
        );
      }

      targetTenantId = impersonatingTenantId;
    } else if (role === "tenant") {
      targetTenantId = userId;
      shouldCalculateDues = true;
    } else {
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 403 });
    }

    const tenantDoc = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(targetTenantId),
    });

    if (!tenantDoc) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const tenant = {
      ...tenantDoc,
      _id: tenantDoc._id.toString(),
      ownerId: tenantDoc.ownerId?.toString?.() || tenantDoc.ownerId,
      createdAt: tenantDoc.createdAt.toISOString(),
      updatedAt: tenantDoc.updatedAt
        ? (tenantDoc.updatedAt instanceof Date
            ? tenantDoc.updatedAt
            : new Date(tenantDoc.updatedAt)
          ).toISOString()
        : undefined,
      wallet: tenantDoc.walletBalance ?? 0,
      status: tenantDoc.status || "active",
      paymentStatus: tenantDoc.paymentStatus || "unknown",
      totalRentPaid: tenantDoc.totalRentPaid ?? 0,
      totalUtilityPaid: tenantDoc.totalUtilityPaid ?? 0,
      totalDepositPaid: tenantDoc.totalDepositPaid ?? 0,
    };

    let analytics = null;
    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [tenantDoc.propertyId]);

    if (shouldCalculateDues) {
      const today = new Date();
      const property = ObjectId.isValid(tenantDoc.propertyId)
        ? await db.collection<PropertyPenaltyConfig>("properties").findOne({ _id: new ObjectId(tenantDoc.propertyId) })
        : null;
      const { monthsStayed } = calculateTenantRentDueToDate({ tenant: tenantDoc as any, today, rentOverrideMap });
      const state = await calculateTenantFinancialState(db, tenantDoc, { asOf: today, property, rentOverrideMap });

      const rentPaid = state.rentPaid;
      const depositPaid = state.depositPaid;
      const utilityPaid = state.utilitiesPaid;
      const updatedTotalRentPaid = rentPaid;
      const updatedWalletBalance = state.walletBalance;
      const penaltyDues = state.penalties;
      const rentDues = state.rentOutstanding + penaltyDues;
      const depositDues = state.depositOutstanding;
      const utilityDues = state.utilitiesOutstanding;
      const totalRemainingDues = state.totalOutstanding;

      const paymentStatus = totalRemainingDues > 0 ? "overdue" : "up-to-date";

      await db.collection("tenants").updateOne(
        { _id: new ObjectId(targetTenantId) },
        {
          $set: {
            totalRentPaid: updatedTotalRentPaid,
            totalUtilityPaid: utilityPaid,
            totalDepositPaid: depositPaid,
            walletBalance: updatedWalletBalance,
            paymentStatus,
            updatedAt: today.toISOString(),
          },
        }
      );

      const monthlyPayments = await getMonthlyPayments(db, targetTenantId, monthsStayed);
      const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
        tenant: tenantDoc as any,
        date: today,
        rentOverrideMap,
      });

      Object.assign(tenant, {
        monthsStayed,
        totalRentPaid: updatedTotalRentPaid,
        totalUtilityPaid: utilityPaid,
        totalDepositPaid: depositPaid,
        walletBalance: updatedWalletBalance,
        wallet: updatedWalletBalance,
        paymentStatus,
        dues: {
          rentDues,
          penaltyDues,
          utilityDues,
          depositDues,
          totalRemainingDues,
          walletApplied: 0,
          walletRemaining: updatedWalletBalance,
          walletCoverageMonths: effectiveMonthlyRent
            ? Math.floor(updatedWalletBalance / effectiveMonthlyRent)
            : 0,
          walletCoverageRemainder: effectiveMonthlyRent
            ? updatedWalletBalance % effectiveMonthlyRent
            : updatedWalletBalance,
        },
      });

      analytics = {
        monthlyPayments,
        paymentBreakdown: [
          { name: "Rent", value: rentPaid },
          { name: "Utility", value: utilityPaid },
          { name: "Deposit", value: depositPaid },
        ],
      };
    }

    return NextResponse.json({ success: true, tenant, analytics }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error in /api/tenant/profile:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

interface PropertyPenaltyConfig {
  _id: ObjectId;
  rentPaymentDate?: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
}

export async function PUT(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  if (!userId || !ObjectId.isValid(userId) || role !== "tenant") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  let body: { tenantId?: string; name?: string; email?: string; phone?: string } | null = null;

  try {
    body = await request.json();

    const { tenantId, name, email, phone } = body || {};

    if (!tenantId || tenantId !== userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phone || "").trim();

    if (!cleanName || !cleanEmail || !cleanPhone) {
      return NextResponse.json(
        { success: false, message: "Name, email, and phone are required" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(userId),
      role: "tenant",
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const ownerId = tenant.ownerId;

    const duplicateEmail = await db.collection<Tenant>("tenants").findOne({
      ownerId,
      email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
      _id: { $ne: new ObjectId(userId) },
    });

    if (duplicateEmail) {
      return NextResponse.json(
        { success: false, message: "This email is already in use" },
        { status: 409 }
      );
    }

    const duplicatePhone = await db.collection<Tenant>("tenants").findOne({
      ownerId,
      phone: cleanPhone,
      _id: { $ne: new ObjectId(userId) },
    });

    if (duplicatePhone) {
      return NextResponse.json(
        { success: false, message: "This phone number is already in use" },
        { status: 409 }
      );
    }

    const updateResult = await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "Update failed" }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, message: "Profile updated successfully" },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in PUT /api/tenant/profile:", {
      message: error instanceof Error ? error.message : "Unknown error",
      tenantId: body?.tenantId || "unknown",
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}


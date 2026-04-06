import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import { calculateOverduePenalty, calculateTenantRentDueToDate, calculateWalletBalanceFromPayments, resolveTenantMonthlyRentForDate } from "../../../../lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";

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

interface Payment {
  tenantId: string;
  type: string;
  status: string;
  amount: number;
  createdAt: Date | string;
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
  const payments = await db
    .collection<Payment>("payments")
    .find({ tenantId: targetTenantId, status: "completed" })
    .sort({ createdAt: -1 })
    .toArray();

  const monthlyMap: Record<
    string,
    { rent: number; utility: number; deposit: number; total: number }
  > = {};

  payments.forEach((p) => {
    let date: Date;

    if (p.createdAt instanceof Date) {
      date = p.createdAt;
    } else if (typeof p.createdAt === "string") {
      date = new Date(p.createdAt);
      if (isNaN(date.getTime())) {
        console.warn(`Invalid payment date: ${p.createdAt} for payment ${p._id}`);
        return;
      }
    } else {
      console.warn(`Invalid createdAt type: ${typeof p.createdAt}`);
      return;
    }

    const monthKey = date.toISOString().slice(0, 7); // YYYY-MM

    if (!monthlyMap[monthKey]) {
      monthlyMap[monthKey] = { rent: 0, utility: 0, deposit: 0, total: 0 };
    }

    if (p.type === "Rent") {
      monthlyMap[monthKey].rent += p.amount;
    } else if (p.type === "Utility") {
      monthlyMap[monthKey].utility += p.amount;
    } else if (p.type === "Deposit") {
      monthlyMap[monthKey].deposit += p.amount;
    }

    monthlyMap[monthKey].total += p.amount;
  });

  // ── Debug helper (uncomment when investigating zero values) ────────
  // console.log("[DEBUG monthly payments map]", JSON.stringify(monthlyMap, null, 2));
  // ───────────────────────────────────────────────────────────────────

  const monthlyPayments: Array<{
    month: string;
    rent: number;
    utility: number;
    deposit: number;
    total: number;
    paid: boolean;
  }> = [];

  const today = new Date();

  for (let i = 0; i < Math.min(12, monthsStayed || 12); i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthKey = date.toISOString().slice(0, 7);
    const monthName = date.toLocaleString("default", { month: "short", year: "2-digit" });

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
      const { rentDue, monthsStayed } = calculateTenantRentDueToDate({
        tenant: tenantDoc as any,
        today,
        rentOverrideMap,
      });

      const payments = await db
        .collection<Payment>("payments")
        .find({ tenantId: targetTenantId, status: "completed" })
        .toArray();

      let rentPaid = 0,
        depositPaid = 0,
        utilityPaid = 0;

      for (const p of payments) {
        if (p.type === "Rent") rentPaid += p.amount;
        else if (p.type === "Deposit") depositPaid += p.amount;
        else if (p.type === "Utility") utilityPaid += p.amount;
      }

      const depositDue = tenantDoc.leasedUnits && tenantDoc.leasedUnits.length > 0
        ? tenantDoc.leasedUnits.reduce((sum: number, unit: { deposit?: number }) => sum + (unit.deposit || 0), 0)
        : (tenantDoc.deposit || 0);

      const updatedTotalRentPaid = rentPaid;
      const updatedWalletBalance = calculateWalletBalanceFromPayments({
        rentPaid,
        depositPaid,
        utilityPaid,
        rentDue,
        depositDue,
        utilityDue: 0,
      });

      const baseRentDues = Math.max(0, rentDue - updatedTotalRentPaid);
      const penaltyDues = calculateOverduePenalty({
        rentDues: baseRentDues,
        today,
        rentPaymentDate: property?.rentPaymentDate,
        leaseStartDate: tenantDoc.leaseStartDate,
        penaltyAmount: property?.penaltyAmount,
        penaltyFrequency: property?.penaltyFrequency,
      });
      const rentDues = Math.max(0, baseRentDues + penaltyDues);
      const depositDues = Math.max(0, depositDue - depositPaid);
      const utilityDues = 0;
      const totalRemainingDues = Math.max(0, rentDues + depositDues + utilityDues);

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


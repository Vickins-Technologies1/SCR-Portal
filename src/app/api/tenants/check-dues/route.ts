// src/app/api/tenants/check-dues/route.ts

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { calculateRentDueToDate, calculateWalletBalanceFromPayments, resolveMonthlyRentForDate } from "@/lib/utils";
import { buildOverrideKey, fetchActiveRentOverridesByPropertyIds, filterOverridesForUnit } from "@/lib/rent-overrides";

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  houseNumber: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus?: string;
  walletBalance: number;
  totalRentPaid?: number;
  totalDepositPaid?: number;
  totalUtilityPaid?: number;
}

interface Stats {
  activeProperties: number;
  totalTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  totalMonthlyRent: number;
  overduePayments: number;
  totalPayments: number;
  totalOverdueAmount: number;
}

interface Payment {
  _id?: ObjectId;
  tenantId: string;
  propertyId?: string;
  type: string;
  status: string;
  amount: number;
  paymentDate?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId || !ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Valid userId is required" }, { status: 400 });
  }

  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const today = new Date();
    const todayISO = today.toISOString();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    const properties = await db.collection("properties").find({ ownerId: userId }).toArray();
    const propertyIds = properties.map((p: any) => p._id.toString());

    if (propertyIds.length === 0) {
      const emptyStats: Stats = {
        activeProperties: 0,
        totalTenants: 0,
        totalUnits: 0,
        occupiedUnits: 0,
        totalMonthlyRent: 0,
        overduePayments: 0,
        totalPayments: 0,
        totalOverdueAmount: 0,
      };
      return NextResponse.json({ success: true, stats: emptyStats });
    }

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);

    // 1. Total Units
    const totalUnitsResult = await db.collection("properties")
      .aggregate([
        { $match: { ownerId: userId } },
        { $unwind: "$unitTypes" },
        { $group: { _id: null, totalUnits: { $sum: "$unitTypes.quantity" } } },
      ])
      .toArray();
    const totalUnits = totalUnitsResult[0]?.totalUnits || 0;

    // 2. Active Tenants + Occupied Units
    const activeTenants = await db.collection<Tenant>("tenants")
      .find({
        propertyId: { $in: propertyIds },
        leaseStartDate: { $lte: todayISO },
        leaseEndDate: { $gte: todayISO },
        status: "active",
      })
      .toArray() as Tenant[];

    const totalTenants = activeTenants.length;
    const occupiedUnits = totalTenants;

    // 3. Total Monthly Revenue Collected (this month)
    const monthlyRentResult = await db.collection("payments")
      .aggregate([
        {
          $match: {
            propertyId: { $in: propertyIds },
            status: "completed",
            paymentDate: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, totalMonthlyRent: { $sum: "$amount" } } },
      ])
      .toArray();
    const totalMonthlyRent = monthlyRentResult[0]?.totalMonthlyRent || 0;

    // 4. Total Payments Ever
    const totalPaymentsResult = await db.collection("payments")
      .aggregate([
        { $match: { propertyId: { $in: propertyIds }, status: "completed" } },
        { $group: { _id: null, totalPayments: { $sum: "$amount" } } },
      ])
      .toArray();
    const totalPayments = totalPaymentsResult[0]?.totalPayments || 0;

    // 5. Overdue Calculation
    const paymentsByTenant = await db.collection("payments")
      .aggregate([
        { $match: { propertyId: { $in: propertyIds }, status: "completed" } },
        {
          $group: {
            _id: "$tenantId",
            rentPaid: { $sum: { $cond: [{ $eq: ["$type", "Rent"] }, "$amount", 0] } },
            depositPaid: { $sum: { $cond: [{ $eq: ["$type", "Deposit"] }, "$amount", 0] } },
          },
        },
      ])
      .toArray();

    const paidMap = Object.fromEntries(
      paymentsByTenant.map((p: any) => [p._id.toString(), { rentPaid: p.rentPaid, depositPaid: p.depositPaid }])
    );

    let overdueCount = 0;
    let totalOverdueAmount = 0;

    const bulkUpdates: any[] = [];

    for (const tenant of activeTenants) {
      const tenantIdStr = tenant._id.toString();
      const paid = paidMap[tenantIdStr] || { rentPaid: 0, depositPaid: 0 };
      const overrides = filterOverridesForUnit(
        rentOverrideMap.get(buildOverrideKey(tenant.propertyId, tenant.unitType)) ?? [],
        tenant.unitIdentifier
      );
      const { rentDue, monthsStayed } = calculateRentDueToDate({
        leaseStartDate: tenant.leaseStartDate,
        monthlyRent: tenant.price,
        today,
        overrides,
      });
      const depositDue = tenant.deposit || 0;
      const totalDue = rentDue + depositDue;
      const totalPaid = paid.rentPaid + paid.depositPaid;
      const remaining = Math.max(0, totalDue - totalPaid);

      if (remaining > 0) {
        overdueCount++;
        totalOverdueAmount += remaining;
      }

      const newStatus = remaining > 0 ? "overdue" : "up-to-date";

      if (tenant.paymentStatus !== newStatus) {
        bulkUpdates.push({
          updateOne: {
            filter: { _id: tenant._id },
            update: { $set: { paymentStatus: newStatus, updatedAt: todayISO } },
          },
        });
      }
    }

    if (bulkUpdates.length > 0) {
      await db.collection("tenants").bulkWrite(bulkUpdates);
    }

    const stats: Stats = {
      activeProperties: propertyIds.length,
      totalTenants,
      totalUnits,
      occupiedUnits,
      totalMonthlyRent,
      overduePayments: overdueCount,
      totalPayments,
      totalOverdueAmount,
    };

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    logger.error("Error in owner stats", { error });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId } = body;

  if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json(
      { success: false, message: "Valid tenantId is required" },
      { status: 400 }
    );
  }

  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    return NextResponse.json(
      { success: false, message: "Invalid CSRF token" },
      { status: 403 }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const today = new Date();
    const todayISO = today.toISOString();

    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    const tenantIdStr = tenantId.toString();

    // Fetch real payments
    const payments = await db
      .collection<Payment>("payments")
      .find({
        tenantId: tenantIdStr,
        status: "completed",
      })
      .toArray();

    // Calculate actual paid amounts from payments
    const rentPaid = payments
      .filter(p => p.type === "Rent")
      .reduce((sum, p) => sum + p.amount, 0);

    const depositPaid = payments
      .filter(p => p.type === "Deposit")
      .reduce((sum, p) => sum + p.amount, 0);

    const utilityPaid = payments
      .filter(p => p.type === "Utility")
      .reduce((sum, p) => sum + p.amount, 0);

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [tenant.propertyId]);
    const overrides = filterOverridesForUnit(
      rentOverrideMap.get(buildOverrideKey(tenant.propertyId, tenant.unitType)) ?? [],
      tenant.unitIdentifier
    );
    const { rentDue, monthsStayed } = calculateRentDueToDate({
      leaseStartDate: tenant.leaseStartDate,
      monthlyRent: tenant.price,
      today,
      overrides,
    });
    const depositDue = tenant.deposit || 0;

    const updatedTotalRentPaid = rentPaid;
    const updatedWalletBalance = calculateWalletBalanceFromPayments({
      rentPaid,
      depositPaid,
      utilityPaid,
      rentDue,
      depositDue,
      utilityDue: 0,
    });

    const rentDues = Math.max(0, rentDue - updatedTotalRentPaid);
    const depositDues = Math.max(0, depositDue - depositPaid);
    const utilityDues = 0;
    const totalRemainingDues = Math.max(0, rentDues + depositDues + utilityDues);

    const paymentStatus = totalRemainingDues > 0 ? "overdue" : "up-to-date";

    // Update tenant with accurate totals + status
    await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      {
        $set: {
          totalRentPaid: updatedTotalRentPaid,
          totalDepositPaid: depositPaid,
          totalUtilityPaid: utilityPaid,
          walletBalance: updatedWalletBalance,
          paymentStatus,
          updatedAt: todayISO,
        },
      }
    );

    const effectiveMonthlyRent = resolveMonthlyRentForDate({
      monthlyRent: tenant.price,
      date: today,
      overrides,
    });

    const dues = {
      rentDues,
      depositDues,
      utilityDues,
      totalRemainingDues,
      walletApplied: 0,
      walletRemaining: updatedWalletBalance,
      walletCoverageMonths: effectiveMonthlyRent ? Math.floor(updatedWalletBalance / effectiveMonthlyRent) : 0,
      walletCoverageRemainder: effectiveMonthlyRent ? updatedWalletBalance % effectiveMonthlyRent : updatedWalletBalance,
    };

    logger.info("Tenant dues recalculated and totals synced", {
      tenantId,
      monthsStayed,
      rentDue,
      depositDue,
      rentPaid,
      depositPaid,
      totalRemainingDues,
    });

    return NextResponse.json({
      success: true,
      tenant: {
        ...tenant,
        _id: tenant._id.toString(),
        totalRentPaid: updatedTotalRentPaid,
        totalDepositPaid: depositPaid,
        totalUtilityPaid: utilityPaid,
        walletBalance: updatedWalletBalance,
        paymentStatus,
        updatedAt: todayISO,
      },
      dues,
      monthsStayed,
    });
  } catch (error) {
    logger.error("Error checking tenant dues", { error, tenantId });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db } from "mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

interface Property {
  _id: string;
  ownerId: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
}

interface Tenant {
  _id: string;
  propertyId: string;
  price: number;
  status: string;
  leaseStartDate: string;
  leaseEndDate: string;
}

interface Payment {
  tenantId: string;
  amount: number;
  paymentDate: string;
  status: "completed" | "pending" | "failed";
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
  currentMonthPayments: number;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");

  if (!userId || role !== "propertyOwner" || userId !== requestedUserId) {
    logger.error("Unauthorized access attempt", { userId, role, requestedUserId });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId, csrfToken });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Fetch properties
    const properties = await db
      .collection<Property>("properties")
      .find({ ownerId: userId })
      .toArray();
    const propertyIds = properties.map((p) => p._id);

    // Fetch tenants
    const tenants = await db
      .collection<Tenant>("tenants")
      .find({ propertyId: { $in: propertyIds } })
      .toArray();

    // Fetch payments
    const payments = await db
      .collection<Payment>("payments")
      .find({ propertyId: { $in: propertyIds } })
      .toArray();

    // Calculate stats
    const activeProperties = properties.length;
    const totalTenants = tenants.length;
    const totalUnits = properties.reduce((sum, property) => {
      return sum + (property.unitTypes?.reduce((s, unit) => s + unit.quantity, 0) || 0);
    }, 0);
    const occupiedUnits = tenants.filter((t) => t.status === "active").length;

    const totalMonthlyRent = tenants.reduce((sum, tenant) => {
      if (
        tenant.status !== "active" ||
        !tenant.leaseStartDate ||
        !tenant.leaseEndDate ||
        !tenant.price ||
        tenant.price <= 0
      ) return sum;
      const leaseStart = new Date(tenant.leaseStartDate);
      const leaseEnd = new Date(tenant.leaseEndDate);
      if (
        isNaN(leaseStart.getTime()) ||
        isNaN(leaseEnd.getTime()) ||
        leaseEnd < leaseStart ||
        leaseStart > currentMonthEnd ||
        leaseEnd < currentMonthStart
      ) return sum;
      return sum + tenant.price;
    }, 0);

    const overduePayments = tenants.reduce((count, tenant) => {
      if (
        tenant.status !== "active" ||
        !tenant.leaseStartDate ||
        !tenant.leaseEndDate ||
        !tenant.price ||
        tenant.price <= 0
      ) return count;
      const leaseStart = new Date(tenant.leaseStartDate);
      const leaseEnd = new Date(tenant.leaseEndDate);
      if (isNaN(leaseStart.getTime()) || isNaN(leaseEnd.getTime()) || leaseEnd < leaseStart) return count;

      const startDate = leaseStart > today ? today : leaseStart;
      const endDate = leaseEnd < today ? leaseEnd : today;
      const daysInLease = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const monthsInLease = Math.max(0, daysInLease / 30);
      const expectedPayments = tenant.price * monthsInLease;

      const totalPaid = payments
        .filter((p) => p.tenantId === tenant._id && p.status === "completed" && !isNaN(new Date(p.paymentDate).getTime()))
        .reduce((sum, p) => sum + p.amount, 0);

      const overdueAmount = expectedPayments - totalPaid;
      return overdueAmount > 0 ? count + 1 : count;
    }, 0);

    const totalOverdueAmount = tenants.reduce((sum, tenant) => {
      if (
        tenant.status !== "active" ||
        !tenant.leaseStartDate ||
        !tenant.leaseEndDate ||
        !tenant.price ||
        tenant.price <= 0
      ) return sum;
      const leaseStart = new Date(tenant.leaseStartDate);
      const leaseEnd = new Date(tenant.leaseEndDate);
      if (isNaN(leaseStart.getTime()) || isNaN(leaseEnd.getTime()) || leaseEnd < leaseStart) return sum;

      const startDate = leaseStart > today ? today : leaseStart;
      const endDate = leaseEnd < today ? leaseEnd : today;
      const daysInLease = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const monthsInLease = Math.max(0, daysInLease / 30);
      const expectedPayments = tenant.price * monthsInLease;

      const totalPaid = payments
        .filter((p) => p.tenantId === tenant._id && p.status === "completed" && !isNaN(new Date(p.paymentDate).getTime()))
        .reduce((sum, p) => sum + p.amount, 0);

      return sum + Math.max(0, expectedPayments - totalPaid);
    }, 0);

    const currentMonthPayments = payments.reduce((sum, payment) => {
      if (payment.status !== "completed" || !payment.paymentDate) return sum;
      const paymentDate = new Date(payment.paymentDate);
      if (isNaN(paymentDate.getTime())) return sum;
      if (paymentDate >= currentMonthStart && paymentDate <= currentMonthEnd) {
        return sum + payment.amount;
      }
      return sum;
    }, 0);

    const totalPayments = payments.reduce((sum, p) => sum + (p.status === "completed" ? p.amount : 0), 0);

    const stats: Stats = {
      activeProperties,
      totalTenants,
      totalUnits,
      occupiedUnits,
      totalMonthlyRent,
      overduePayments,
      totalPayments,
      totalOverdueAmount,
      currentMonthPayments,
    };

    logger.debug("Owner stats calculated", { userId, stats });

    return NextResponse.json({ success: true, stats }, { status: 200 });
  } catch (error: unknown) {
    logger.error("GET Owner Stats Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
    });
    return NextResponse.json({ success: false, message: "Server error while fetching stats" }, { status: 500 });
  }
}
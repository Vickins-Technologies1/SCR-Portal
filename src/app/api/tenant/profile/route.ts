// src/app/api/tenant/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

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
  createdAt: Date;
}

async function calculateMonthsStayed(db: Db, tenant: Tenant, today: Date): Promise<number> {
  if (!tenant.leaseStartDate) return 0;

  try {
    const result = await db.collection("tenants").aggregate([
      { $match: { _id: tenant._id } },
      {
        $project: {
          months: {
            $floor: {
              $add: [
                {
                  $dateDiff: {
                    startDate: { $dateFromString: { dateString: "$leaseStartDate" } },
                    endDate: today,
                    unit: "month",
                  },
                },
                1, // include current partial month
              ],
            },
          },
        },
      },
    ]).toArray();

    return result[0]?.months ?? 0;
  } catch (err) {
    console.error("Months calculation failed", err);
    return 0;
  }
}

async function getMonthlyPayments(db: Db, targetTenantId: string, monthsStayed: number): Promise<Array<{ month: string; rent: number; utility: number; total: number; paid: boolean }>> {
  const payments = await db.collection<Payment>("payments")
    .find({ tenantId: targetTenantId, status: "completed" })
    .sort({ createdAt: -1 })
    .toArray();

  // Group payments by month (simplified: assume recent months, or generate last N months)
  const monthlyMap: Record<string, { rent: number; utility: number; total: number }> = {};
  payments.forEach(p => {
    const month = p.createdAt.toISOString().slice(0, 7); // YYYY-MM
    if (!monthlyMap[month]) monthlyMap[month] = { rent: 0, utility: 0, total: 0 };
    if (p.type === "Rent") monthlyMap[month].rent += p.amount;
    else if (p.type === "Utility") monthlyMap[month].utility += p.amount;
    monthlyMap[month].total += p.amount;
  });

  // Generate last 12 months or based on monthsStayed
  const monthlyPayments = [];
  const today = new Date();
  for (let i = 0; i < Math.min(12, monthsStayed); i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthKey = date.toISOString().slice(0, 7);
    const monthName = date.toLocaleString('default', { month: 'short' });
    const data = monthlyMap[monthKey] || { rent: 0, utility: 0, total: 0 };
    monthlyPayments.push({
      month: monthName,
      ...data,
      paid: data.total > 0, // Simplified: paid if any payment in month
    });
  }

  return monthlyPayments.reverse(); // Oldest to newest
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    const impersonatingTenantId = cookieStore.get("impersonatingTenantId")?.value;
    const isImpersonating = cookieStore.get("isImpersonating")?.value === "true";

    console.log("GET /api/tenant/profile", { userId, role, isImpersonating, impersonatingTenantId });

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    let targetTenantId = userId;
    let shouldCalculateDues = false;

    // ── Impersonation logic (owner viewing tenant) ───────────────
    if (isImpersonating && impersonatingTenantId && ObjectId.isValid(impersonatingTenantId) && role === "propertyOwner") {
      const tenantCheck = await db.collection("tenants").findOne({
        _id: new ObjectId(impersonatingTenantId),
        ownerId: userId,
      });

      if (!tenantCheck) {
        return NextResponse.json({ success: false, message: "Unauthorized to view this tenant" }, { status: 403 });
      }

      targetTenantId = impersonatingTenantId;
      // For impersonation → return raw data (keep check-dues separate)
    } 
    // ── Real tenant login ────────────────────────────────────────
    else if (role === "tenant") {
      targetTenantId = userId;
      shouldCalculateDues = true;   // ← this is the key change
    } 
    else {
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 403 });
    }

    const tenantDoc = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(targetTenantId),
    });

    if (!tenantDoc) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Prepare base response tenant object
    const tenant = {
      ...tenantDoc,
      _id: tenantDoc._id.toString(),
      createdAt: tenantDoc.createdAt.toISOString(),
      updatedAt: tenantDoc.updatedAt
        ? (tenantDoc.updatedAt instanceof Date ? tenantDoc.updatedAt : new Date(tenantDoc.updatedAt)).toISOString()
        : undefined,
      wallet: tenantDoc.walletBalance ?? 0,
      status: tenantDoc.status || "active",
      paymentStatus: tenantDoc.paymentStatus || "unknown",
      totalRentPaid: tenantDoc.totalRentPaid ?? 0,
      totalUtilityPaid: tenantDoc.totalUtilityPaid ?? 0,
      totalDepositPaid: tenantDoc.totalDepositPaid ?? 0,
    };

    let analytics = null;

    // Only calculate fresh dues/totals for real tenant login
    if (shouldCalculateDues) {
      const today = new Date();
      const monthsStayed = await calculateMonthsStayed(db, tenantDoc, today);

      const payments = await db.collection<Payment>("payments")
        .find({ tenantId: targetTenantId, status: "completed" })
        .toArray();

      let rentPaid = 0, depositPaid = 0, utilityPaid = 0;
      for (const p of payments) {
        if (p.type === "Rent") rentPaid += p.amount;
        else if (p.type === "Deposit") depositPaid += p.amount;
        else if (p.type === "Utility") utilityPaid += p.amount;
      }

      const rentDue   = tenantDoc.price * monthsStayed;
      const depositDue = tenantDoc.deposit || 0;
      const totalDue   = rentDue + depositDue;
      const totalPaid  = rentPaid + depositPaid + utilityPaid;

      const remaining = Math.max(0, totalDue - totalPaid);
      const paymentStatus = remaining > 0 ? "overdue" : "up-to-date";

      // Optional: update database (recommended)
      await db.collection("tenants").updateOne(
        { _id: new ObjectId(targetTenantId) },
        { $set: {
            totalRentPaid: rentPaid,
            totalUtilityPaid: utilityPaid,
            totalDepositPaid: depositPaid,
            paymentStatus,
            updatedAt: today.toISOString(),
          }
        }
      );

      // Get monthly payments for analytics
      const monthlyPayments = await getMonthlyPayments(db, targetTenantId, monthsStayed);

      // Attach calculated values
      Object.assign(tenant, {
        monthsStayed,
        totalRentPaid: rentPaid,
        totalUtilityPaid: utilityPaid,
        totalDepositPaid: depositPaid,
        paymentStatus,
        dues: {
          rentDues: Math.max(0, rentDue - rentPaid),
          utilityDues: 0,           // ← extend later if needed
          depositDues: Math.max(0, depositDue - depositPaid),
          totalRemainingDues: remaining,
        },
      });

      analytics = {
        monthlyPayments,
        paymentBreakdown: [
          { name: "Rent", value: rentPaid },
          { name: "Utility", value: utilityPaid },
          { name: "Deposit", value: depositPaid },
        ]
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
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
  createdAt: Date | string;
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
    console.error("Months calculation failed:", err);
    return 0;
  }
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

    if (shouldCalculateDues) {
      const today = new Date();
      const monthsStayed = await calculateMonthsStayed(db, tenantDoc, today);

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

      const rentDue = tenantDoc.price * monthsStayed;
      const depositDue = tenantDoc.deposit || 0;
      const totalDue = rentDue + depositDue;
      const totalPaid = rentPaid + depositPaid + utilityPaid;

      const remaining = Math.max(0, totalDue - totalPaid);
      const paymentStatus = remaining > 0 ? "overdue" : "up-to-date";

      await db.collection("tenants").updateOne(
        { _id: new ObjectId(targetTenantId) },
        {
          $set: {
            totalRentPaid: rentPaid,
            totalUtilityPaid: utilityPaid,
            totalDepositPaid: depositPaid,
            paymentStatus,
            updatedAt: today.toISOString(),
          },
        }
      );

      const monthlyPayments = await getMonthlyPayments(db, targetTenantId, monthsStayed);

      Object.assign(tenant, {
        monthsStayed,
        totalRentPaid: rentPaid,
        totalUtilityPaid: utilityPaid,
        totalDepositPaid: depositPaid,
        paymentStatus,
        dues: {
          rentDues: Math.max(0, rentDue - rentPaid),
          utilityDues: 0,
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
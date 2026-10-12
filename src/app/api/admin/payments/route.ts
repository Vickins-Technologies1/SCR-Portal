// src/app/api/admin/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";
import { getFinancialReportSummary } from "@/lib/financial-reporting";

interface Payment {
  _id: ObjectId;
  amount: number;
  postedAmount?: number;
  date?: Date | string;
  paymentDate?: Date | string;
  status: string;
  propertyOwnerId?: ObjectId;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db }: { db: Db } = await connectToDatabase();

    // Get total count
    const count = await db.collection<Payment>("payments").countDocuments();

    const financialSummary = await getFinancialReportSummary({ db });
    const totalCollected = financialSummary.netReceived;

    // Optional: fetch recent payments (limit to last 50 for performance)
    const payments = await db
      .collection<Payment>("payments")
      .find({})
      .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
      .limit(50)
      .project({ _id: 1, amount: 1, postedAmount: 1, paymentDate: 1, date: 1, status: 1 })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        count: count || 0,
        totalCollected: totalCollected || 0,
        payments: payments.map((p) => ({
          _id: p._id.toString(),
          amount: p.postedAmount ?? p.amount ?? 0,
          date: p.paymentDate instanceof Date ? p.paymentDate.toISOString() : p.paymentDate || (p.date instanceof Date ? p.date.toISOString() : p.date || "N/A"),
          status: p.status || "N/A",
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Payments fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Failed to fetch payments: Server error" },
      { status: 500 }
    );
  }
}

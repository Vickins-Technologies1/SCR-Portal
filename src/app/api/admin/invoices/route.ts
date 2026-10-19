// src/app/api/admin/invoices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";
import { calculateInvoiceFinancialState } from "@/lib/financial-reporting";

interface Invoice {
  _id: ObjectId;
  amount: number;
  date: Date;
  status: string;
  propertyOwnerId?: ObjectId;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:invoices:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const allInvoices = await db.collection<Invoice>("invoices").find({}).toArray();
    const financialStates = await Promise.all(allInvoices.map((invoice) => calculateInvoiceFinancialState(db, invoice)));
    const totalPaid = financialStates.reduce((sum, state) => sum + state.amountPaid, 0);
    const totalUnpaid = financialStates.reduce((sum, state) => sum + state.balanceDue, 0);
    const pendingCount = financialStates.filter((state) => state.balanceDue > 0).length;
    const count = allInvoices.length;
    const invoices = allInvoices
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 50);

    return NextResponse.json(
      {
        success: true,
        count: count || 0,
        totalPaid: totalPaid || 0,
        totalUnpaid: totalUnpaid || 0,
        pendingCount: pendingCount || 0,
        invoices: invoices.map((i) => ({
          _id: i._id.toString(),
          amount: i.amount || 0,
          date: i.date ? new Date(i.date).toISOString() : "N/A",
          status: financialStates[allInvoices.indexOf(i)]?.status || i.status || "N/A",
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Invoices fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Failed to fetch invoices: Server error" },
      { status: 500 }
    );
  }
}

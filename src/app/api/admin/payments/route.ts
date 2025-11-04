// src/app/api/admin/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface Payment {
  _id: ObjectId;
  amount: number;
  date: Date;
  status: string;
  propertyOwnerId?: ObjectId; // Optional reference to property owner
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;

  // Validate role cookie
  if (!role || role !== "admin") {
    console.log("Unauthorized access attempt - role:", role || "missing");
    return NextResponse.json(
      { success: false, message: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    
    // Fetch payment count
    const count = await db.collection<Payment>("payments").countDocuments();

    // Fetch payment details (optional, for consistency)
    const payments = await db
      .collection<Payment>("payments")
      .find({})
      .project<Payment>({ _id: 1, amount: 1, date: 1, status: 1 })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        count: count || 0, // Ensure count is always a number
        payments: payments.map((p) => ({
          _id: p._id.toString(),
          amount: p.amount || 0,
          date: p.date ? p.date.toISOString() : "N/A",
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
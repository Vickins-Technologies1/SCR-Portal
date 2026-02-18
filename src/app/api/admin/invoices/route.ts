// src/app/api/admin/invoices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface Invoice {
  _id: ObjectId;
  amount: number;
  date: Date;
  status: string;
  propertyOwnerId?: ObjectId;
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;

  if (!role || role !== "admin") {
    console.log("Unauthorized access attempt - role:", role || "missing");
    return NextResponse.json(
      { success: false, message: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    // Total invoice count
    const count = await db.collection<Invoice>("invoices").countDocuments();

    // Sum of paid/completed invoices
    const paidResult = await db.collection<Invoice>("invoices").aggregate([
      {
        $match: {
          status: { $in: ["completed", "paid", "settled"] }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$amount" }
        }
      }
    ]).toArray();

    const totalPaid = paidResult[0]?.totalPaid ?? 0;

    // Sum of unpaid/pending invoices
    const unpaidResult = await db.collection<Invoice>("invoices").aggregate([
      {
        $match: {
          status: { $in: ["pending", "unpaid", "overdue"] }
        }
      },
      {
        $group: {
          _id: null,
          totalUnpaid: { $sum: "$amount" }
        }
      }
    ]).toArray();

    const totalUnpaid = unpaidResult[0]?.totalUnpaid ?? 0;

    // Count of pending invoices
    const pendingCount = await db.collection<Invoice>("invoices").countDocuments({
      status: { $in: ["pending", "unpaid", "overdue"] }
    });

    // Optional: recent invoices
    const invoices = await db
      .collection<Invoice>("invoices")
      .find({})
      .sort({ date: -1 })
      .limit(50)
      .project({ _id: 1, amount: 1, date: 1, status: 1 })
      .toArray();

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
          date: i.date ? i.date.toISOString() : "N/A",
          status: i.status || "N/A",
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
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

interface Invoice {
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
    
    // Fetch invoice count
    const count = await db.collection<Invoice>("invoices").countDocuments();

    // Fetch invoice details (optional, for consistency)
    const invoices = await db
      .collection<Invoice>("invoices")
      .find({})
      .project<Invoice>({ _id: 1, amount: 1, date: 1, status: 1 })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        count: count || 0, // Ensure count is always a number
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
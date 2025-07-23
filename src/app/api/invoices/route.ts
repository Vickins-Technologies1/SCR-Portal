import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const count = await db.collection("invoices").countDocuments();
    return NextResponse.json({ success: true, count });
  } catch (error: any) {
    console.error("Invoices fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch invoices" }, { status: 500 });
  }
}
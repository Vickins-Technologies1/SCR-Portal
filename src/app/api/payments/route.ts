import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ success: false, message: "Missing tenantId" }, { status: 400 });
    }

    const cookieStore = await cookies(); // ✅ FIXED
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "tenant" || userId !== tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const payments = await db.collection("payments").find({ tenantId }).toArray();

    return NextResponse.json({
      success: true,
      payments: payments.map((p) => ({
        _id: p._id.toString(),
        tenantId: p.tenantId,
        propertyId: p.propertyId.toString(),
        type: p.type,
        amount: p.amount,
        dueDate: p.dueDate,
        status: p.status,
        paymentDate: p.paymentDate,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const ownerId = request.cookies.get("userId")?.value;
  const paymentId = request.nextUrl.searchParams.get("paymentId");
  if (role !== "propertyOwner" || !ownerId || !paymentId || !ObjectId.isValid(paymentId)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const { db } = await connectToDatabase();
  const payment = await db.collection("payments").findOne({ _id: new ObjectId(paymentId), ownerId, planType: "lifetime" }, { projection: { status: 1, verificationStatus: 1, amount: 1, currency: 1, providerReference: 1, mpesaCode: 1, paidAt: 1 } });
  if (!payment) return NextResponse.json({ success: false, message: "Payment not found." }, { status: 404 });
  const entitlement = await db.collection("entitlements").findOne({ ownerId, planType: "lifetime", status: "active" }, { projection: { purchasedAt: 1, expiresAt: 1, autoRenew: 1 } });
  return NextResponse.json({ success: true, payment: { ...payment, _id: payment._id.toString() }, entitlement: entitlement ? { ...entitlement, _id: entitlement._id.toString() } : null });
}

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const payouts = await db
    .collection("airbnbPayouts")
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .toArray();

  const directPayments = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect" })
    .sort({ paymentDate: -1 })
    .toArray();

  const directMapped = directPayments.map((payment) => ({
    id: payment._id?.toString?.() || "",
    propertyName: payment.propertyName || payment.listingName || "Direct Booking",
    amount: payment.amount,
    period: payment.paymentDate
      ? new Date(payment.paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "Direct payment",
    status: payment.status === "completed" ? "paid" : payment.status === "failed" ? "failed" : "processing",
    method: "M-Pesa",
  }));

  return NextResponse.json({
    success: true,
    payouts: [
      ...payouts.map((payout) => ({
        id: payout.externalId || payout._id?.toString?.() || "",
        propertyName: payout.propertyName,
        amount: payout.amount,
        period: payout.period,
        status: payout.status,
        method: payout.method,
      })),
      ...directMapped,
    ],
  });
}

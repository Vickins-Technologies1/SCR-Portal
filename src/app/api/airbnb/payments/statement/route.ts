import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { getMonthRange, parseDate } from "@/lib/airbnb-utils";
import { ObjectId } from "mongodb";
import { generateAirbnbOwnerStatementPdf } from "@/lib/airbnb-owner-statement-pdf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  const { start, end } = getMonthRange();
  const periodLabel = `${start.toLocaleDateString("en-KE", { month: "long", year: "numeric" })}`;

  const payoutsRaw = await db
    .collection("airbnbPayouts")
    .find({ ownerId, status: "paid" })
    .sort({ createdAt: -1 })
    .toArray();

  const directPaymentsRaw = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect", status: "completed" })
    .sort({ paymentDate: -1 })
    .toArray();

  const inRange = (value?: string | Date | null) => {
    const parsed = parseDate(value || null);
    if (!parsed) return false;
    return parsed >= start && parsed <= end;
  };

  const payouts = payoutsRaw.filter((payout) => inRange(payout.createdAt || payout.period));
  const directPayments = directPaymentsRaw.filter((payment) => inRange(payment.paymentDate || payment.createdAt));

  const owner = ObjectId.isValid(ownerId)
    ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) })
    : null;

  const rows = [
    ...payouts.map((payout) => ({
      propertyName: payout.propertyName || "Airbnb Listing",
      period: payout.period || new Date(payout.createdAt || Date.now()).toLocaleDateString("en-KE"),
      amount: Number(payout.amount || 0),
      status: payout.status || "scheduled",
      method: payout.method || "M-Pesa",
      mpesaCode: payout.mpesaCode || payout.mpesaReceiptNumber || payout.reference || "",
    })),
    ...directPayments.map((payment) => ({
      propertyName: payment.propertyName || payment.listingName || "Direct Booking",
      period: payment.paymentDate
        ? new Date(payment.paymentDate).toLocaleDateString("en-KE", { month: "short", day: "numeric" })
        : "Direct payment",
      amount: Number(payment.amount || 0),
      status: payment.status === "completed" ? "paid" : payment.status === "failed" ? "failed" : "processing",
      method: "M-Pesa",
      mpesaCode: payment.mpesaCode || payment.mpesaReceiptNumber || payment.reference || "",
    })),
  ];

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  const pdfBytes = await generateAirbnbOwnerStatementPdf({
    periodLabel,
    ownerName: owner?.name || "Property Owner",
    ownerEmail: owner?.email || "support@soranapropertymanagers.com",
    totalAmount,
    rows,
  });
  return NextResponse.json({
    success: true,
    pdf: Buffer.from(pdfBytes).toString("base64"),
    filename: `airbnb-owner-statement-${start.toISOString().slice(0, 10)}.pdf`,
  });
}

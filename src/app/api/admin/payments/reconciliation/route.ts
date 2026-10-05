import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:view");
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
  const { db } = await connectToDatabase();
  const payments = await db.collection("payments").find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  const reversals = await db.collection("financialLedger").find({ kind: "PAYMENT_REVERSED", status: "posted" }).toArray();
  const reversedByPayment = new Map<string, number>();
  for (const reversal of reversals) reversedByPayment.set(String(reversal.sourcePaymentId), (reversedByPayment.get(String(reversal.sourcePaymentId)) || 0) + Number(reversal.amount || 0));
  return NextResponse.json({
    success: true,
    readOnly: true,
    payments: payments.map((payment) => {
      const original = Number(payment.postedAmount ?? payment.amount ?? 0);
      const reversed = reversedByPayment.get(String(payment._id)) || 0;
      const allocation = payment.allocation || {};
      const allocated = ["rent", "utilities", "deposit", "other", "walletCredit"].reduce((sum, key) => sum + Number(allocation[key] || 0), 0);
      const status = payment.financialPostingStatus === "quarantined"
        ? "QUARANTINED"
        : reversed > original ? "REQUIRES_REVIEW"
        : !payment.allocation ? "UNALLOCATED"
        : allocated > original + 0.01 ? "AMOUNT_MISMATCH"
        : reversed > 0 && reversed < original ? "PARTIALLY_RECONCILED"
        : "RECONCILED";
      return {
        paymentId: String(payment._id), providerReference: payment.providerTransactionId || payment.mpesaCode || payment.reference || null,
        tenantId: payment.tenantId || null, propertyId: payment.propertyId || null,
        amount: original, postedAmount: Number(payment.postedAmount ?? payment.amount ?? 0), allocatedAmount: allocated,
        reversedAmount: reversed, credit: Number(allocation.walletCredit || 0), outstanding: Math.max(0, original - reversed - allocated),
        postingStatus: payment.financialPostingStatus || "LEGACY_REQUIRES_REVIEW", reconciliationStatus: status,
      };
    }),
  });
}


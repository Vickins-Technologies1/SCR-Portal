// src/app/api/tenant/payments/check-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { z } from "zod";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";

const StatusSchema = z.object({
  transaction_request_id: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
  csrfToken: z.string().trim().min(1),
});

const normalizeStatus = (status: unknown): "initiated" | "pending" | "processing" | "successful" | "failed" | "cancelled" | "expired" | "review" => {
  const value = String(status || "").toLowerCase();
  if (["completed", "successful", "success", "paid"].includes(value)) return "successful";
  if (["failed", "error"].includes(value)) return "failed";
  if (["cancelled", "canceled", "reversed"].includes(value)) return "cancelled";
  if (["expired", "timeout", "timed_out"].includes(value)) return "expired";
  if (["processing", "review", "quarantined"].includes(value)) return value as "processing" | "review";
  if (["pending", "pending_stk", "queued"].includes(value)) return "pending";
  return "initiated";
};

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  // Auth guard for tenant status lookup
  if (!userId || !role || !["tenant", "propertyOwner", "admin"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const parsed = StatusSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { transaction_request_id, tenantId, propertyId, csrfToken } = parsed.data;

  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId });
    return buildInvalidCsrfResponse(request);
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    // Resolve status from our own payments collection (updated by callbacks)
    const payment = await db.collection("payments").findOne({
      $or: [
        { transactionId: transaction_request_id },
        { checkoutRequestId: transaction_request_id },
        { merchantRequestId: transaction_request_id },
      ],
      tenantId,
      propertyId,
    });

    if (!payment) {
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    if (role === "tenant" && tenantId !== userId) {
      return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
    }
    if (role === "propertyOwner") {
      if (!ObjectId.isValid(propertyId)) return NextResponse.json({ success: false, message: "Invalid property" }, { status: 400 });
      const property = await db.collection("properties").findOne({
        _id: new ObjectId(propertyId),
        ownerId: { $in: [userId, ...(ObjectId.isValid(userId) ? [new ObjectId(userId)] : [])] },
      });
      if (!property) return NextResponse.json({ success: false, message: "Unauthorized property access" }, { status: 403 });
    }

    // Status polling is also a safe recovery trigger when a callback recorded
    // provider success but the process crashed before financial posting.
    if (payment.status === "completed" && payment.financialPostingStatus !== "posted" && payment.financialPostingStatus !== "quarantined") {
      try {
        const posting = await postVerifiedPayment({
          db,
          paymentId: payment._id,
          providerConfirmedAmount: payment.providerConfirmedAmount,
          providerTransactionId: payment.providerTransactionId || payment.transactionId,
          providerReceipt: payment.mpesaCode,
        });
        if (posting.outcome === "posted" || posting.outcome === "duplicate") {
          Object.assign(payment, posting.payment);
        }
      } catch (error) {
        logger.warn("Payment posting recovery during status check failed", {
          paymentId: String(payment._id),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const publicStatus = payment.financialPostingStatus === "quarantined"
      ? "review"
      : payment.status === "completed" && ["pending", "processing"].includes(String(payment.financialPostingStatus || ""))
        ? "processing"
        : normalizeStatus(payment.status);

    return NextResponse.json({
      success: true,
      message: "Transaction status retrieved",
      status: publicStatus,
      transaction: {
        mpesaCode: payment.mpesaCode,
        amount: payment.providerConfirmedAmount ?? payment.postedAmount ?? payment.amount,
        status: publicStatus,
        resultCode: payment.resultCode ?? null,
        resultDesc: payment.resultDesc || null,
        paymentDate: payment.paymentDate,
        phoneNumber: payment.phoneNumber,
        reference: payment.reference,
      },
    });
  } catch (error: unknown) {
    logger.error("POST Check Transaction Status Error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, message: "Server error while checking transaction status" },
      { status: 500 }
    );
  }
}

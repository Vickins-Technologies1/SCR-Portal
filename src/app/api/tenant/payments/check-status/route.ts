// src/app/api/tenant/payments/check-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db } from "mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { z } from "zod";
import { getIncomingPaymentStatus } from "@/lib/kopokopo";

function normalizeMsisdn(value?: string): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function isLikelyMpesaReceipt(reference?: string): boolean {
  if (!reference) return false;
  const trimmed = reference.trim();
  return /^[A-Z0-9]{10}$/i.test(trimmed);
}

const StatusSchema = z.object({
  transaction_request_id: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
  csrfToken: z.string().trim().min(1),
});

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
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    // Resolve status from our own payments collection (updated by callbacks)
    let payment = await db.collection("payments").findOne({
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

    if (payment.status === "pending" && (payment.provider === "kopokopo" || payment.kopokopoIncomingPaymentId)) {
      const incomingId = payment.kopokopoIncomingPaymentId || payment.transactionId;
      try {
        const statusData = await getIncomingPaymentStatus(String(incomingId));
        const statusLower = (statusData.status || "").toLowerCase();
        const resourceStatusLower = (statusData.resourceStatus || "").toLowerCase();
        const errorsLower = (statusData.errors || "").toLowerCase();
        const hasReference = !!statusData.reference;
        const referenceValid = isLikelyMpesaReceipt(statusData.reference);
        const expectedPhone = normalizeMsisdn(payment.phoneNumber);
        const incomingPhone = normalizeMsisdn(statusData.phoneNumber);
        const phoneMatches = !incomingPhone || !expectedPhone || incomingPhone === expectedPhone;
        const amountMatches =
          !statusData.amount || Number(statusData.amount) === Number(payment.amount);

        const isCompleted =
          statusLower === "success" &&
          resourceStatusLower === "received" &&
          hasReference &&
          referenceValid &&
          phoneMatches &&
          amountMatches;
        const isCancelled =
          statusLower === "failed" &&
          (errorsLower.includes("cancel") || errorsLower.includes("canceled") || errorsLower.includes("cancelled"));
        const isFailed =
          statusLower === "failed" ||
          resourceStatusLower === "failed" ||
          errorsLower.includes("timeout") ||
          errorsLower.includes("expired");
        const normalizedStatus = isCompleted ? "completed" : isCancelled ? "cancelled" : isFailed ? "failed" : "pending";

        const shouldUpdate =
          normalizedStatus !== payment.status ||
          (hasReference && !payment.mpesaCode) ||
          (statusData.originationTime && payment.paymentDate !== statusData.originationTime);

        if (shouldUpdate) {
          const update: Record<string, any> = { status: normalizedStatus };
          if (isCompleted && statusData.reference) update.mpesaCode = statusData.reference;
          if (statusData.originationTime) update.paymentDate = statusData.originationTime;

          await db.collection("payments").updateOne({ _id: payment._id }, { $set: update });
          payment = { ...payment, ...update };
        }
      } catch (error) {
        logger.error("KopoKopo status check failed", {
          message: error instanceof Error ? error.message : "Unknown error",
          incomingId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Transaction status retrieved",
      status: payment.status,
      transaction: {
        mpesaCode: payment.mpesaCode,
        amount: payment.amount,
        status: payment.status,
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

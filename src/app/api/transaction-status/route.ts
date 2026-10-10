// src/app/api/transaction-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { z } from "zod";
import { getIncomingPaymentStatus } from "@/lib/kopokopo";
import { ObjectId } from "mongodb";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";

const StatusSchema = z.object({
  transactionRequestId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  logger.debug("POST /api/transaction-status request", { userId, role });

  // Auth + CSRF guard for status lookup
  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized: Invalid user or role" }, { status: 401 });
  }

  if (!csrfToken || !validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
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

  try {
    const { db }: { db: Db } = await connectToDatabase();
    // Read payment state from our DB (callbacks update this record)
    const payment = await db.collection("payments").findOne({
      $or: [
        { transactionId: parsed.data.transactionRequestId },
        { checkoutRequestId: parsed.data.transactionRequestId },
        { merchantRequestId: parsed.data.transactionRequestId },
      ],
    });

    if (!payment) {
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    if (role === "tenant" && String(payment.tenantId || "") !== userId) {
      return NextResponse.json({ success: false, message: "Unauthorized payment access" }, { status: 403 });
    }
    if (role === "propertyOwner") {
      const ownerMatch = String(payment.ownerId || payment.landlordId || "") === userId;
      const propertyMatch = ObjectId.isValid(String(payment.propertyId))
        ? await db.collection("properties").findOne({
            _id: new ObjectId(String(payment.propertyId)),
            ownerId: { $in: [userId, ...(ObjectId.isValid(userId) ? [new ObjectId(userId)] : [])] },
          })
        : null;
      if (!ownerMatch && !propertyMatch) return NextResponse.json({ success: false, message: "Unauthorized payment access" }, { status: 403 });
    }

    const paymentProvider = String(payment.provider || "").toLowerCase();
    const paymentStatus = String(payment.status || "").toLowerCase();

    if (paymentProvider === "kopokopo" && ["pending", "pending_stk"].includes(paymentStatus)) {
      const kopokopoRequestId =
        payment.kopokopoPaymentRequestId ||
        payment.checkoutRequestId ||
        payment.transactionId ||
        parsed.data.transactionRequestId;

      try {
        const kopokopoStatus = await getIncomingPaymentStatus(String(kopokopoRequestId));
        const normalized = kopokopoStatus.status;

        if (normalized === "completed" || normalized === "failed") {
          await db.collection("payments").updateOne(
            {
              _id: payment._id,
            },
            {
              $set: {
                status: normalized === "completed" ? "completed" : "failed",
                mpesaCode: kopokopoStatus.receipt || payment.mpesaCode || null,
                reference: kopokopoStatus.reference || payment.reference || undefined,
                updatedAt: new Date().toISOString(),
              },
            }
          );

          payment.status = normalized === "completed" ? "completed" : "failed";
          payment.mpesaCode = kopokopoStatus.receipt || payment.mpesaCode || null;
          if (payment.status === "completed") {
            await postVerifiedPayment({
              db,
              paymentId: payment._id,
              providerConfirmedAmount: payment.providerConfirmedAmount,
              providerTransactionId: payment.providerTransactionId || kopokopoRequestId,
              providerReceipt: payment.mpesaCode,
            });
          }
        }
      } catch (error) {
        logger.warn("KopoKopo status lookup failed", {
          transactionRequestId: parsed.data.transactionRequestId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const resultStatus = payment.financialPostingStatus === "quarantined"
      ? "review"
      : payment.status === "completed" && ["pending", "processing"].includes(String(payment.financialPostingStatus || ""))
        ? "processing"
        : payment.status;
    const resultDesc =
      resultStatus === "completed"
        ? "Completed"
        : resultStatus === "failed"
        ? "Failed"
        : resultStatus === "cancelled"
        ? "Cancelled"
        : resultStatus === "review"
        ? "Received and held for reconciliation"
        : "Pending";

    return NextResponse.json(
      {
        success: true,
        TransactionStatus: resultStatus,
        ResultDesc: resultDesc,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("POST /api/transaction-status error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error while checking transaction status" },
      { status: 500 }
    );
  }
}

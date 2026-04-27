import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { resolveTenantContext } from "@/lib/impersonation";

const StatusSchema = z.object({
  transaction_request_id: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
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
    const { db } = await connectToDatabase();
    const tenantContext = await resolveTenantContext({
      db,
      userId,
      role,
      isImpersonating,
      impersonatingTenantId,
    });

    if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const transactionRequestId = parsed.data.transaction_request_id;

    const payment = await db.collection("payments").findOne({
      airbnbTenantId: tenantContext.tenantId,
      $or: [
        { transactionId: transactionRequestId },
        { checkoutRequestId: transactionRequestId },
        { merchantRequestId: transactionRequestId },
      ],
    });

    if (!payment) {
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
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
        provider: payment.provider,
      },
    });
  } catch (error: unknown) {
    logger.error("POST /api/airbnb-tenant/payments/check-status error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, message: "Server error while checking transaction status" },
      { status: 500 }
    );
  }
}

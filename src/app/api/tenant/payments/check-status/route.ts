// src/app/api/tenant/payments/check-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { z } from "zod";

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
    return buildInvalidCsrfResponse(request);
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

    // For KopoKopo STK Push, rely on webhook updates to avoid premature completion.

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

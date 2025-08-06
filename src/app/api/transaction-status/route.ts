import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db } from "mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

const UMS_PAY_API_KEY = process.env.UMS_PAY_API_KEY || "";
const UMS_PAY_EMAIL = process.env.UMS_PAY_EMAIL || "";
const UMS_PAY_ACCOUNT_ID = process.env.UMS_PAY_ACCOUNT_ID || "";

interface TransactionStatusRequest {
  transactionRequestId: string;
}

interface TransactionStatusResponse {
  success: boolean;
  TransactionStatus?: string;
  ResultDesc?: string;
  message?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<TransactionStatusResponse>> {
  const startTime = Date.now();
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  logger.debug("POST /api/transaction-status request", { userId, role, csrfToken });

  // Validate user and role
  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized: Invalid user or role" }, { status: 401 });
  }

  // Validate CSRF token
  if (!csrfToken || !validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid or missing CSRF token", { userId, csrfToken });
    return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
  }

  // Validate environment variables
  if (!UMS_PAY_API_KEY || !UMS_PAY_EMAIL || !UMS_PAY_ACCOUNT_ID) {
    logger.error("Missing UMS Pay configuration", {
      hasApiKey: !!UMS_PAY_API_KEY,
      hasEmail: !!UMS_PAY_EMAIL,
      hasAccountId: !!UMS_PAY_ACCOUNT_ID,
    });
    return NextResponse.json(
      { success: false, message: "Server configuration error: Missing payment credentials" },
      { status: 500 }
    );
  }

  try {
    const body: TransactionStatusRequest = await request.json();
    const { transactionRequestId } = body;

    if (!transactionRequestId) {
      logger.error("Missing transactionRequestId", { userId, body });
      return NextResponse.json(
        { success: false, message: "Transaction request ID is required" },
        { status: 400 }
      );
    }

    const requestBody = {
      api_key: UMS_PAY_API_KEY,
      email: UMS_PAY_EMAIL,
      transaction_request_id: transactionRequestId,
    };

    logger.debug("Transaction status request body", { requestBody, userId });

    const statusRes = await fetch("https://api.umspay.co.ke/api/v1/transactionstatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const statusData = await statusRes.json();
    logger.debug("Transaction status response", { statusData, userId });

    if (!statusRes.ok) {
      logger.error("Status check failed", { status: statusRes.status, response: statusData, userId });
      return NextResponse.json(
        { success: false, message: statusData.errorMessage || "Failed to check transaction status" },
        { status: statusRes.status }
      );
    }

    // Store the transaction status in the database
    const { db }: { db: Db } = await connectToDatabase();
    await db.collection("payment_status_logs").insertOne({
      userId,
      transactionRequestId,
      status: statusData.TransactionStatus,
      resultDesc: statusData.ResultDesc,
      checkedAt: new Date(),
    });

    logger.info("Transaction status checked successfully", {
      userId,
      transactionRequestId,
      status: statusData.TransactionStatus,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      TransactionStatus: statusData.TransactionStatus,
      ResultDesc: statusData.ResultDesc,
    }, { status: 200 });

  } catch (error) {
    logger.error("POST /api/transaction-status error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
      duration: Date.now() - startTime,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error while checking transaction status" },
      { status: 500 }
    );
  }
}
// src/app/api/mpesa/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

type AccountType = "till" | "bank";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  // Only property owners can fetch their own M-Pesa connection status
  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectMongoose();
    const doc = await LandlordMpesa.findOne({ landlord: userId })
      .select({ accountType: 1, bankName: 1, accountNumber: 1, tillNumber: 1, _id: 0 })
      .lean<{
        accountType?: AccountType;
        bankName?: string;
        accountNumber?: string;
        tillNumber?: string;
      }>()
      .exec();

    return NextResponse.json({
      success: true,
      connected: !!doc,
      accountType: doc?.accountType || "till",
      bankName: doc?.bankName || "",
      accountNumber: doc?.accountNumber || "",
      tillNumber: doc?.tillNumber || "",
    });
  } catch (error) {
    logger.error("GET /api/mpesa/connect error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch M-Pesa status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  // Ensure only landlords can connect and CSRF is valid
  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
  }

  type Payload = {
    accountType?: AccountType;
    bankName?: string;
    accountNumber?: string;
    tillNumber?: string;
  };
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }
  const accountType: AccountType = payload.accountType === "bank" ? "bank" : "till";

  try {
    await connectMongoose();
    if (accountType === "bank") {
      if (!payload.bankName || !payload.accountNumber) {
        return NextResponse.json(
          { success: false, message: "Please provide a bank name and account number." },
          { status: 400 }
        );
      }
    } else if (!payload.tillNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a till number." },
        { status: 400 }
      );
    }

    await LandlordMpesa.findOneAndUpdate(
      { landlord: userId },
      {
        accountType,
        bankName: accountType === "bank" ? payload.bankName : "",
        accountNumber: accountType === "bank" ? payload.accountNumber : "",
        tillNumber: accountType === "till" ? payload.tillNumber : "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, message: "Account details saved successfully" }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/mpesa/connect error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to connect M-Pesa" }, { status: 500 });
  }
}

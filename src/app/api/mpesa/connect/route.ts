// src/app/api/mpesa/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { createPayRecipient } from "@/lib/kopokopo";

type PaymentType = "paybill" | "till" | "bank";

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
      .select({
        paymentType: 1,
        paybillNumber: 1,
        paybillAccountNumber: 1,
        tillNumber: 1,
        accountNumber: 1,
        bankBranchRef: 1,
        bankSettlementMethod: 1,
        bankAccountName: 1,
        isDefault: 1,
        kopokopoRecipientType: 1,
        kopokopoRecipientUrl: 1,
        _id: 0,
      })
      .lean<{
        paymentType?: PaymentType;
        paybillNumber?: string;
        paybillAccountNumber?: string;
        tillNumber?: string;
        accountNumber?: string;
        bankBranchRef?: string;
        bankSettlementMethod?: string;
        bankAccountName?: string;
        isDefault?: boolean;
        kopokopoRecipientType?: string;
        kopokopoRecipientUrl?: string;
      }>()
      .exec();

    return NextResponse.json({
      success: true,
      connected: !!doc?.kopokopoRecipientUrl,
      paymentType: doc?.paymentType || "paybill",
      paybillNumber: doc?.paybillNumber || "",
      paybillAccountNumber: doc?.paybillAccountNumber || "",
      tillNumber: doc?.tillNumber || "",
      accountNumber: doc?.accountNumber || "",
      bankBranchRef: doc?.bankBranchRef || "",
      bankSettlementMethod: doc?.bankSettlementMethod || "",
      bankAccountName: doc?.bankAccountName || "",
      isDefault: doc?.isDefault ?? true,
      kopokopoRecipientUrl: doc?.kopokopoRecipientUrl || "",
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
    paymentType?: PaymentType;
    paybillNumber?: string;
    paybillAccountNumber?: string;
    tillNumber?: string;
    accountNumber?: string;
    bankBranchRef?: string;
    bankSettlementMethod?: string;
    bankAccountName?: string;
    isDefault?: boolean;
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
  const paymentType: PaymentType =
    payload.paymentType === "bank" || payload.paymentType === "till" || payload.paymentType === "paybill"
      ? payload.paymentType
      : "paybill";

  try {
    await connectMongoose();
    if (paymentType === "bank") {
      if (!payload.bankBranchRef || !payload.accountNumber || !payload.bankSettlementMethod) {
        return NextResponse.json(
          { success: false, message: "Please provide bank branch reference, account number, and settlement method." },
          { status: 400 }
        );
      }
    } else if (paymentType === "till" && !payload.tillNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a till number." },
        { status: 400 }
      );
    } else if (paymentType === "paybill" && !payload.paybillNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a paybill number." },
        { status: 400 }
      );
    } else if (paymentType === "paybill" && !payload.paybillAccountNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a paybill account number." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
    const ownerName = owner?.name || owner?.companyName || "Property Owner";

    let recipientType = "";
    let recipientUrl = "";
    if (paymentType === "till") {
      recipientType = "till";
      const recipient = await createPayRecipient({
        type: "till",
        payload: {
          till_name: ownerName,
          till_number: payload.tillNumber as string,
        },
      });
      recipientUrl = recipient.location;
    } else if (paymentType === "bank") {
      recipientType = "bank_account";
      const recipient = await createPayRecipient({
        type: "bank_account",
        payload: {
          account_name: payload.bankAccountName?.trim() || ownerName,
          bank_branch_ref: payload.bankBranchRef as string,
          account_number: payload.accountNumber as string,
          settlement_method: payload.bankSettlementMethod as string,
        },
      });
      recipientUrl = recipient.location;
    } else {
      recipientType = "paybill";
      const recipient = await createPayRecipient({
        type: "paybill",
        payload: {
          paybill_name: ownerName,
          paybill_number: payload.paybillNumber as string,
          paybill_account_number: payload.paybillAccountNumber as string,
        },
      });
      recipientUrl = recipient.location;
    }

    await LandlordMpesa.findOneAndUpdate(
      { landlord: userId },
      {
        paymentType,
        paybillNumber: paymentType === "paybill" ? payload.paybillNumber : "",
        paybillAccountNumber: paymentType === "paybill" ? payload.paybillAccountNumber : "",
        tillNumber: paymentType === "till" ? payload.tillNumber : "",
        accountNumber: paymentType === "bank" ? payload.accountNumber : "",
        bankBranchRef: paymentType === "bank" ? payload.bankBranchRef : "",
        bankSettlementMethod: paymentType === "bank" ? payload.bankSettlementMethod : "",
        bankAccountName: paymentType === "bank" ? payload.bankAccountName : "",
        isDefault: payload.isDefault ?? true,
        kopokopoRecipientType: recipientType,
        kopokopoRecipientUrl: recipientUrl,
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

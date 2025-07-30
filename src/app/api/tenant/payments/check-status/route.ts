
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import axios from "axios";

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  status: string;
  paymentStatus: string;
  leaseStartDate: string;
  walletBalance: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
}

interface PaymentSettings {
  ownerId: ObjectId;
  umsPayEnabled: boolean;
  umsPayApiKey: string;
  umsPayEmail: string;
  umsPayAccountId: string;
}

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed" | "cancelled";
  createdAt: string;
  type: "Rent" | "Utility";
  phoneNumber: string;
  reference: string;
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["tenant", "propertyOwner", "admin"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { transaction_request_id, tenantId, propertyId, csrfToken } = body;

    if (!transaction_request_id) {
      return NextResponse.json({ success: false, message: "Missing transaction_request_id" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ success: false, message: "Missing tenantId" }, { status: 400 });
    }
    if (!propertyId) {
      return NextResponse.json({ success: false, message: "Missing propertyId" }, { status: 400 });
    }
    if (!csrfToken) {
      return NextResponse.json({ success: false, message: "Missing CSRF token" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    // Validate tenant exists
    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Validate property and get ownerId
    const property = await db
      .collection<Property>("properties")
      .findOne({ _id: new ObjectId(propertyId) });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    // Fetch payment settings for the owner
    const paymentSettings = await db
      .collection<PaymentSettings>("paymentSettings")
      .findOne({ ownerId: new ObjectId(property.ownerId) });

    if (!paymentSettings || !paymentSettings.umsPayEnabled) {
      console.log(`[POST_CHECK_STATUS] UMS Pay not enabled for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "UMS Pay is not enabled for this property owner" },
        { status: 400 }
      );
    }

    const { umsPayApiKey, umsPayEmail, umsPayAccountId } = paymentSettings;

    // Log UMS Pay credentials for debugging
    console.log(`[POST_CHECK_STATUS] UMS Pay credentials for ownerId: ${property.ownerId}`, {
      umsPayApiKey: umsPayApiKey ? "[REDACTED]" : "MISSING",
      umsPayEmail: umsPayEmail || "MISSING",
      umsPayAccountId: umsPayAccountId || "MISSING",
    });

    if (!umsPayApiKey || !umsPayEmail || !umsPayAccountId) {
      console.log(`[POST_CHECK_STATUS] Incomplete UMS Pay configuration for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "Incomplete UMS Pay configuration" },
        { status: 400 }
      );
    }

    // Check transaction status via UMS Pay
    const umsPayResponse = await axios.post(
      "https://api.umspay.co.ke/api/v1/transactionstatus",
      {
        api_key: umsPayApiKey,
        email: umsPayEmail,
        transaction_request_id,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const umsPayData = umsPayResponse.data;
    console.log("[POST_CHECK_STATUS] UMS Pay transaction status response:", umsPayData);

    if (umsPayData.ResultCode !== "200") {
      return NextResponse.json(
        { success: false, message: umsPayData.errorMessage || "Transaction not found" },
        { status: 400 }
      );
    }

    let status: Payment["status"] = "pending";
    let errorMessage = umsPayData.errorMessage;

    // Override status based on MpesaResponse.errorMessage when TransactionStatus is Pending
    if (umsPayData.TransactionStatus === "Pending" && umsPayData.MpesaResponse) {
      try {
        const mpesaResponse = typeof umsPayData.MpesaResponse === "string" 
          ? JSON.parse(umsPayData.MpesaResponse) 
          : umsPayData.MpesaResponse;
        if (mpesaResponse.errorMessage) {
          if (mpesaResponse.errorMessage.includes("Cancel Button")) {
            status = "cancelled";
            errorMessage = "Payment was cancelled by the user.";
          } else if (mpesaResponse.errorMessage.includes("insufficient")) {
            status = "failed";
            errorMessage = "Payment failed due to insufficient balance.";
          }
        }
      } catch (parseError) {
        console.error("[POST_CHECK_STATUS] Error parsing MpesaResponse:", parseError);
      }
    }

    // Use statusMap for other cases
    const statusMap: { [key: string]: Payment["status"] } = {
      Completed: "completed",
      Failed: "failed",
      Cancelled: "cancelled",
      Timeout: "failed",
      Pending: "pending",
    };

    if (!errorMessage && umsPayData.TransactionStatus !== "Pending") {
      status = statusMap[umsPayData.TransactionStatus] || "pending";
      errorMessage = status === "failed" ? "Payment failed." : status === "cancelled" ? "Payment was cancelled by the user." : undefined;
    }

    // Update payment in MongoDB
    await db.collection<Payment>("payments").updateOne(
      { transactionId: transaction_request_id },
      {
        $set: {
          status,
          paymentDate: umsPayData.TransactionDate
            ? new Date(umsPayData.TransactionDate).toISOString()
            : new Date().toISOString(),
          transactionId: umsPayData.TransactionReceipt || transaction_request_id,
        },
      }
    );

    // Update tenant wallet balance if completed
    if (status === "completed") {
      await db.collection<Tenant>("tenants").updateOne(
        { _id: new ObjectId(tenantId) },
        { $inc: { walletBalance: Number(umsPayData.TransactionAmount) } }
      );
    }

    return NextResponse.json({
      success: true,
      message: errorMessage || "Transaction status retrieved",
      status,
      transaction: {
        transactionId: umsPayData.TransactionReceipt || transaction_request_id,
        amount: umsPayData.TransactionAmount,
        status,
        paymentDate: umsPayData.TransactionDate,
        phoneNumber: umsPayData.Msisdn,
        reference: umsPayData.TransactionReference,
      },
    });
  } catch (error: any) {
    console.error("[POST_CHECK_STATUS] Check Transaction Status Error:", error.response?.data || error.message);
    return NextResponse.json(
      { success: false, message: error.response?.data?.errorMessage || "Server error while checking transaction status" },
      { status: 500 }
    );
  }
}
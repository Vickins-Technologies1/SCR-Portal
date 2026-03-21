import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import axios from "axios";
import { validateCsrfToken } from "../../../../../lib/csrf";
import logger from "../../../../../lib/logger";
import { sendConfirmationEmail } from "../../../../../lib/email";
import { sendWelcomeSms } from "../../../../../lib/sms";
import { calculateRentDueToDate } from "../../../../../lib/utils";
import { getTenantPaymentTotals } from "../../../../../lib/payment-totals";

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  deposit?: number;
  status: string;
  paymentStatus: string;
  leaseStartDate: string;
  walletBalance: number;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  requiredDeposit?: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
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
  type?: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber: string;
  reference: string;
  mpesaCode?: string | null;
}

interface User {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  role: "tenant" | "propertyOwner" | "admin";
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["tenant", "propertyOwner", "admin"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
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

    if (!validateCsrfToken(request, csrfToken)) {
      logger.error("Invalid CSRF token", { userId });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const tenant = await db
      .collection<Tenant>("tenants")
      .findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      logger.error("Tenant not found", { tenantId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const property = await db
      .collection<Property>("properties")
      .findOne({ _id: new ObjectId(propertyId) });

    if (!property) {
      logger.error("Property not found", { propertyId });
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    const paymentSettings = await db
      .collection<PaymentSettings>("paymentSettings")
      .findOne({ ownerId: new ObjectId(property.ownerId) });

    if (!paymentSettings || !paymentSettings.umsPayEnabled) {
      logger.error(`UMS Pay not enabled for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "UMS Pay is not enabled for this property owner" },
        { status: 400 }
      );
    }

    const { umsPayApiKey, umsPayEmail, umsPayAccountId } = paymentSettings;

    if (!umsPayApiKey || !umsPayEmail || !umsPayAccountId) {
      logger.error(`Incomplete UMS Pay configuration for ownerId: ${property.ownerId}`);
      return NextResponse.json(
        { success: false, message: "Incomplete UMS Pay configuration" },
        { status: 400 }
      );
    }

    const payment = await db
      .collection<Payment>("payments")
      .findOne({ transactionId: transaction_request_id });

    if (!payment) {
      logger.error("Payment not found", { transaction_request_id });
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

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
    logger.debug("UMS Pay transaction status response", umsPayData);

    if (umsPayData.ResultCode !== "200") {
      logger.error("Transaction not found", { errorMessage: umsPayData.errorMessage });
      return NextResponse.json(
        { success: false, message: umsPayData.errorMessage || "Transaction not found" },
        { status: 400 }
      );
    }

    let status: Payment["status"] = "pending";
    let errorMessage: string | undefined = umsPayData.errorMessage;

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
        logger.error("Error parsing MpesaResponse", {
          message: parseError instanceof Error ? parseError.message : "Unknown error",
        });
      }
    }

    const statusMap: { [key: string]: Payment["status"] } = {
      Completed: "completed",
      Failed: "failed",
      Cancelled: "cancelled",
      Timeout: "failed",
      Pending: "pending",
    };

    if (!errorMessage && umsPayData.TransactionStatus !== "Pending") {
      status = statusMap[umsPayData.TransactionStatus] || "pending";
      errorMessage =
        status === "failed"
          ? "Payment failed."
          : status === "cancelled"
          ? "Payment was cancelled by the user."
          : undefined;
    }

    const mpesaCode = umsPayData.TransactionReceipt || transaction_request_id;

    await db.collection<Payment>("payments").updateOne(
      { transactionId: transaction_request_id },
      {
        $set: {
          status,
          paymentDate: umsPayData.TransactionDate
            ? new Date(umsPayData.TransactionDate).toISOString()
            : new Date().toISOString(),
          mpesaCode,
        },
      }
    );

    if (status === "completed") {
      const amount = Number(umsPayData.TransactionAmount);
      const paymentDate = umsPayData.TransactionDate ? new Date(umsPayData.TransactionDate) : new Date();

      const { rentDue: totalRentDue } = calculateRentDueToDate({
        leaseStartDate: tenant.leaseStartDate,
        monthlyRent: tenant.price || 0,
        today: paymentDate,
      });

      const paymentTotals = await getTenantPaymentTotals(db, tenantId);
      const rentPaidBefore =
        payment.type === "Rent"
          ? Math.max(0, paymentTotals.rentPaid - amount)
          : paymentTotals.rentPaid;
      const depositPaidBefore =
        payment.type === "Deposit"
          ? Math.max(0, paymentTotals.depositPaid - amount)
          : paymentTotals.depositPaid;
      const rentDueBefore = Math.max(0, totalRentDue - rentPaidBefore);
      const depositTotal = tenant.deposit ?? tenant.requiredDeposit ?? tenant.price ?? 0;
      const depositDueBefore = Math.max(0, depositTotal - depositPaidBefore);
      const utilityDueBefore = 0;

      let remainingAmount = amount;
      if (payment.type === "Rent") {
        const applied = Math.min(rentDueBefore, remainingAmount);
        remainingAmount -= applied;
      } else if (payment.type === "Utility") {
        const applied = Math.min(utilityDueBefore, remainingAmount);
        remainingAmount -= applied;
      } else if (payment.type === "Deposit") {
        const applied = Math.min(depositDueBefore, remainingAmount);
        remainingAmount -= applied;
      }

      const walletBalance = (tenant.walletBalance || 0) + remainingAmount;
      const updateFields: Partial<Tenant> = {
        totalRentPaid: paymentTotals.rentPaid,
        totalUtilityPaid: paymentTotals.utilityPaid,
        totalDepositPaid: paymentTotals.depositPaid,
        walletBalance,
      };

      await db.collection<Tenant>("tenants").updateOne(
        { _id: new ObjectId(tenantId) },
        { $set: updateFields }
      );

      const updatedTenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
      });

      if (!updatedTenant) {
        logger.error("Failed to fetch updated tenant data", { tenantId });
        return NextResponse.json(
          { success: false, message: "Failed to fetch updated tenant data" },
          { status: 500 }
        );
      }

      const owner = await db
        .collection<User>("users")
        .findOne({ _id: new ObjectId(property.ownerId), role: "propertyOwner" });

      const paymentDateFormatted = new Date(umsPayData.TransactionDate || Date.now()).toLocaleDateString(
        "en-US",
        {
          month: "long",
          day: "numeric",
          year: "numeric",
        }
      );

      const emailCommon = {
        amount: Number(umsPayData.TransactionAmount),
        paymentType: payment.type || "Other",
        transactionId: transaction_request_id,
        paymentDate: paymentDateFormatted,
      };

      // ─── Tenant email ────────────────────────────────────────
      try {
        await sendConfirmationEmail({
          to: tenant.email,
          name: tenant.name,
          propertyName: property.name,
          ...emailCommon,
          mpesaCode, // optional – shown if present
        });
        logger.info("Payment confirmation email sent to tenant", {
          tenantId,
          email: tenant.email,
          mpesaCode,
        });
      } catch (emailError) {
        logger.error("Failed to send payment confirmation email to tenant", {
          tenantId,
          email: tenant.email,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }

      // ─── Tenant SMS ──────────────────────────────────────────
      if (tenant.phone) {
        try {
          const smsText = `Payment of Ksh. ${umsPayData.TransactionAmount} for ${property.name} (${
            payment.type || "Other"
          }) confirmed on ${paymentDateFormatted}. Ref: ${mpesaCode}`;
          await sendWelcomeSms({
            phone: tenant.phone,
            message: smsText.slice(0, 160),
          });
          logger.info("Payment confirmation SMS sent to tenant", { tenantId, phone: tenant.phone, mpesaCode });
        } catch (smsError) {
          logger.error("Failed to send payment confirmation SMS to tenant", {
            tenantId,
            phone: tenant.phone,
            error: smsError instanceof Error ? smsError.message : String(smsError),
          });
        }
      }

      // ─── Owner notifications ─────────────────────────────────
      if (owner) {
        try {
          await sendConfirmationEmail({
            to: owner.email,
            name: owner.name,
            propertyName: property.name,
            tenantName: tenant.name,
            ...emailCommon,
            mpesaCode, // optional
          });
          logger.info("Payment confirmation email sent to property owner", {
            ownerId: property.ownerId,
            email: owner.email,
            mpesaCode,
          });
        } catch (emailError) {
          logger.error("Failed to send payment confirmation email to property owner", {
            ownerId: property.ownerId,
            email: owner.email,
            error: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }

        if (owner.phone) {
          try {
            const smsText = `Payment of Ksh. ${umsPayData.TransactionAmount} by ${tenant.name} for ${
              property.name
            } (${payment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${mpesaCode}`;
            await sendWelcomeSms({
              phone: owner.phone,
              message: smsText.slice(0, 160),
            });
            logger.info("Payment confirmation SMS sent to property owner", {
              ownerId: property.ownerId,
              phone: owner.phone,
              mpesaCode,
            });
          } catch (smsError) {
            logger.error("Failed to send payment confirmation SMS to property owner", {
              ownerId: property.ownerId,
              phone: owner.phone,
              error: smsError instanceof Error ? smsError.message : String(smsError),
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: errorMessage || "Transaction status retrieved",
      status,
      transaction: {
        mpesaCode,
        amount: umsPayData.TransactionAmount,
        status,
        paymentDate: umsPayData.TransactionDate,
        phoneNumber: umsPayData.Msisdn,
        reference: umsPayData.TransactionReference,
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

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "../../../../../lib/csrf";
import logger from "../../../../../lib/logger";
import { sendConfirmationEmail } from "../../../../../lib/email";
import { sendWelcomeSms } from "../../../../../lib/sms";

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
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
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
  type: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber?: string;
  reference: string;
}

interface User {
  _id: ObjectId;
  name: string;
  email: string;

System: string;
  phone: string;
  role: "tenant" | "propertyOwner" | "admin";
}

interface ManualPaymentRequestBody {
  tenantId: string;
  amount: number;
  propertyId: string;
  userId: string;
  type: "Rent" | "Utility" | "Deposit" | "Other";
  reference: string;
  paymentDate: string;
  csrfToken: string;
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || role !== "propertyOwner") {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ManualPaymentRequestBody = await request.json();
    const { tenantId, amount, propertyId, userId: submittedUserId, type, reference, paymentDate, csrfToken } = body;

    if (!validateCsrfToken(request, csrfToken)) {
      logger.error("Invalid CSRF token", { userId, csrfToken });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    // Input validation
    if (!tenantId || !ObjectId.isValid(tenantId)) {
      logger.error("Invalid or missing tenantId", { tenantId });
      return NextResponse.json({ success: false, message: "Invalid or missing tenant ID" }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      logger.error("Invalid amount", { amount });
      return NextResponse.json({ success: false, message: "Amount must be a positive number" }, { status: 400 });
    }
    if (!propertyId || !ObjectId.isValid(propertyId)) {
      logger.error("Invalid or missing propertyId", { propertyId });
      return NextResponse.json({ success: false, message: "Invalid or missing property ID" }, { status: 400 });
    }
    if (submittedUserId !== userId) {
      logger.error("User ID mismatch", { submittedUserId, userId });
      return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 400 });
    }
    if (!type || !["Rent", "Utility", "Deposit", "Other"].includes(type)) {
      logger.error("Invalid payment type", { type });
      return NextResponse.json({ success: false, message: "Invalid payment type" }, { status: 400 });
    }
    if (!reference) {
      logger.error("Missing transaction reference", { reference });
      return NextResponse.json({ success: false, message: "Missing transaction reference" }, { status: 400 });
    }
    if (!paymentDate || isNaN(Date.parse(paymentDate))) {
      logger.error("Invalid payment date", { paymentDate });
      return NextResponse.json({ success: false, message: "Invalid payment date" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    // Validate property
    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(propertyId),
      ownerId: userId,
    });
    if (!property) {
      logger.error("Property not found or not owned", { propertyId, userId });
      return NextResponse.json({ success: false, message: "Property not found or not owned" }, { status: 404 });
    }

    // Validate tenant
    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      propertyId,
    });
    if (!tenant) {
      logger.error("Tenant not found", { tenantId, propertyId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Log tenant data for debugging
    logger.debug("Tenant data before payment", {
      tenantId,
      walletBalance: tenant.walletBalance,
      totalRentPaid: tenant.totalRentPaid,
      totalUtilityPaid: tenant.totalUtilityPaid,
      totalDepositPaid: tenant.totalDepositPaid,
    });

    // Generate a unique transaction ID
    const transactionId = `MANUAL-${new ObjectId().toString()}`;

    // Create payment record
    const payment: Payment = {
      _id: new ObjectId(),
      tenantId,
      amount,
      propertyId,
      paymentDate: new Date(paymentDate).toISOString(),
      transactionId,
      status: "completed",
      createdAt: new Date().toISOString(),
      type,
      reference,
    };

    await db.collection<Payment>("payments").insertOne(payment);

    // Retrieve CSRF token from cookies for the internal fetch
    const fetchedCsrfToken = request.cookies.get("csrf-token")?.value;
    if (!fetchedCsrfToken) {
      logger.error("CSRF token not found in cookies for check-dues fetch", { tenantId, userId });
      return NextResponse.json(
        { success: false, message: "CSRF token not found for dues recalculation" },
        { status: 403 }
      );
    }

    // Trigger dues recalculation via check-dues endpoint
    const checkDuesResponse = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/tenants/check-dues`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": fetchedCsrfToken,
          Cookie: `csrf-token=${fetchedCsrfToken}; userId=${userId}; role=${role}`,
        },
        credentials: "include",
        body: JSON.stringify({
          tenantId,
          userId,
        }),
      }
    );

    const checkDuesData = await checkDuesResponse.json();
    if (!checkDuesData.success) {
      logger.error("Failed to update dues after manual payment", {
        tenantId,
        message: checkDuesData.message,
      });
      // Continue with notifications but log the error
    } else {
      logger.info("Dues recalculated after manual payment", {
        tenantId,
        walletBalance: checkDuesData.tenant.walletBalance,
        totalRentPaid: checkDuesData.tenant.totalRentPaid,
        totalUtilityPaid: checkDuesData.tenant.totalUtilityPaid,
        totalDepositPaid: checkDuesData.tenant.totalDepositPaid,
        totalRemainingDues: checkDuesData.dues.totalRemainingDues,
      });
    }

    // Fetch updated tenant data
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

    // Fetch property owner details
    const owner = await db.collection<User>("users").findOne({
      _id: new ObjectId(userId),
      role: "propertyOwner",
    });

    // Send confirmation notifications
    const formattedDate = new Date(paymentDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    try {
      await sendConfirmationEmail({
        to: tenant.email,
        name: tenant.name,
        propertyName: property.name,
        amount,
        paymentType: type,
        transactionId,
        paymentDate: formattedDate,
      });
      logger.info("Payment confirmation email sent to tenant", {
        tenantId,
        email: tenant.email,
        transactionId,
      });
    } catch (emailError) {
      logger.error("Failed to send payment confirmation email to tenant", {
        tenantId,
        email: tenant.email,
        error: emailError instanceof Error ? emailError.message : "Unknown error",
      });
    }

    if (tenant.phone) {
      try {
        const smsMessage = `Payment of Ksh. ${amount} for ${property.name} (${type}) confirmed on ${formattedDate}. Ref: ${transactionId}`;
        await sendWelcomeSms({
          phone: tenant.phone,
          message: smsMessage.slice(0, 160),
        });
        logger.info("Payment confirmation SMS sent to tenant", {
          tenantId,
          phone: tenant.phone,
          transactionId,
        });
      } catch (smsError) {
        logger.error("Failed to send payment confirmation SMS to tenant", {
          tenantId,
          phone: tenant.phone,
          error: smsError instanceof Error ? smsError.message : "Unknown error",
        });
      }
    }

    if (owner) {
      try {
        await sendConfirmationEmail({
          to: owner.email,
          name: owner.name,
          propertyName: property.name,
          amount,
          paymentType: type,
          transactionId,
          paymentDate: formattedDate,
          tenantName: tenant.name,
        });
        logger.info("Payment confirmation email sent to property owner", {
          ownerId: userId,
          email: owner.email,
          transactionId,
        });
      } catch (emailError) {
        logger.error("Failed to send payment confirmation email to property owner", {
          ownerId: userId,
          email: owner.email,
          error: emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }

      if (owner.phone) {
        try {
          const smsMessage = `Payment of Ksh. ${amount} by ${tenant.name} for ${property.name} (${type}) confirmed on ${formattedDate}. Ref: ${transactionId}`;
          await sendWelcomeSms({
            phone: owner.phone,
            message: smsMessage.slice(0, 160),
          });
          logger.info("Payment confirmation SMS sent to property owner", {
            ownerId: userId,
            phone: owner.phone,
            transactionId,
          });
        } catch (smsError) {
          logger.error("Failed to send payment confirmation SMS to property owner", {
            ownerId: userId,
            phone: owner.phone,
            error: smsError instanceof Error ? smsError.message : "Unknown error",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Manual payment recorded successfully",
      payment: {
        _id: payment._id.toString(),
        tenantId,
        tenantName: tenant.name,
        amount,
        propertyId,
        paymentDate: payment.paymentDate,
        transactionId,
        status: payment.status,
        type,
        reference,
      },
      tenant: {
        walletBalance: updatedTenant.walletBalance,
        totalRentPaid: updatedTenant.totalRentPaid,
        totalUtilityPaid: updatedTenant.totalUtilityPaid,
        totalDepositPaid: updatedTenant.totalDepositPaid,
        paymentStatus: updatedTenant.paymentStatus,
      },
      dues: checkDuesData.success ? checkDuesData.dues : null,
    });
  } catch (error: unknown) {
    logger.error("POST Manual Payment Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
      role,
    });
    return NextResponse.json(
      { success: false, message: "Server error while recording payment" },
      { status: 500 }
    );
  }
}
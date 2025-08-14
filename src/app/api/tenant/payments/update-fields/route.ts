// src/app/api/tenant/payments/update-fields/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "../../../../../lib/csrf";
import logger from "../../../../../lib/logger";

interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  houseNumber: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: "current" | "overdue";
  createdAt: string;
  updatedAt?: string;
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

interface UpdatePaymentFieldsRequestBody {
  paymentId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || role !== "propertyOwner") {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: UpdatePaymentFieldsRequestBody = await request.json();
    const { paymentId, userId: submittedUserId } = body;

    if (!validateCsrfToken(request, paymentId)) {
      logger.error("Invalid CSRF token", { userId, paymentId });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    if (!paymentId || !ObjectId.isValid(paymentId)) {
      logger.error("Invalid or missing paymentId", { paymentId });
      return NextResponse.json({ success: false, message: "Invalid or missing payment ID" }, { status: 400 });
    }
    if (submittedUserId !== userId) {
      logger.error("User ID mismatch", { submittedUserId, userId });
      return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const payment = await db.collection<Payment>("payments").findOne({
      _id: new ObjectId(paymentId),
    });

    if (!payment) {
      logger.error("Payment not found", { paymentId });
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "completed") {
      logger.warn("Payment is not completed, skipping update", { paymentId, status: payment.status });
      return NextResponse.json({ success: false, message: "Payment is not in completed status" }, { status: 400 });
    }

    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(payment.propertyId),
      ownerId: userId,
    });
    if (!property) {
      logger.error("Property not found or not owned", { propertyId: payment.propertyId, userId });
      return NextResponse.json({ success: false, message: "Property not found or not owned" }, { status: 404 });
    }

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(payment.tenantId),
      propertyId: payment.propertyId,
    });
    if (!tenant) {
      logger.error("Tenant not found", { tenantId: payment.tenantId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    logger.debug("Tenant state before update", {
      tenantId: payment.tenantId,
      walletBalance: tenant.walletBalance,
      totalRentPaid: tenant.totalRentPaid,
      totalUtilityPaid: tenant.totalUtilityPaid,
      totalDepositPaid: tenant.totalDepositPaid,
    });

    const today = new Date();
    const leaseStartDate = new Date(tenant.leaseStartDate);
    const monthsStayed = Math.max(0, Math.floor((today.getTime() - leaseStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));

    const rentDue = Math.max(0, tenant.price * monthsStayed - (tenant.totalRentPaid || 0));
    const depositDue = Math.max(0, (tenant.deposit || 0) - (tenant.totalDepositPaid || 0));
    const utilityDue = 0;

    let walletBalance = tenant.walletBalance || 0;
    let remainingAmount = payment.amount;
    const updateFields: Partial<Tenant> = {
      totalRentPaid: tenant.totalRentPaid || 0,
      totalUtilityPaid: tenant.totalUtilityPaid || 0,
      totalDepositPaid: tenant.totalDepositPaid || 0,
    };

    const applyPayment = (due: number, currentPaid: number, maxPay: number) => {
      const applied = Math.min(due, maxPay);
      return { applied, remaining: maxPay - applied };
    };

    switch (payment.type) {
      case "Rent": {
        const { applied, remaining } = applyPayment(rentDue, updateFields.totalRentPaid!, remainingAmount);
        updateFields.totalRentPaid! += applied;
        remainingAmount = remaining;
        break;
      }
      case "Utility": {
        const { applied, remaining } = applyPayment(utilityDue, updateFields.totalUtilityPaid!, remainingAmount);
        updateFields.totalUtilityPaid! += applied;
        remainingAmount = remaining;
        break;
      }
      case "Deposit": {
        const { applied, remaining } = applyPayment(depositDue, updateFields.totalDepositPaid!, remainingAmount);
        updateFields.totalDepositPaid! += applied;
        remainingAmount = remaining;
        break;
      }
      case "Other":
        break;
    }

    walletBalance += remainingAmount;

    if (walletBalance > 0 && rentDue > updateFields.totalRentPaid!) {
      const { applied, remaining } = applyPayment(
        rentDue - updateFields.totalRentPaid!,
        updateFields.totalRentPaid!,
        walletBalance
      );
      updateFields.totalRentPaid! += applied;
      walletBalance = remaining;
    }

    if (walletBalance > 0 && utilityDue > updateFields.totalUtilityPaid!) {
      const { applied, remaining } = applyPayment(
        utilityDue - updateFields.totalUtilityPaid!,
        updateFields.totalUtilityPaid!,
        walletBalance
      );
      updateFields.totalUtilityPaid! += applied;
      walletBalance = remaining;
    }

    if (walletBalance > 0 && depositDue > updateFields.totalDepositPaid!) {
      const { applied, remaining } = applyPayment(
        depositDue - updateFields.totalDepositPaid!,
        updateFields.totalDepositPaid!,
        walletBalance
      );
      updateFields.totalDepositPaid! += applied;
      walletBalance = remaining;
    }

    updateFields.walletBalance = walletBalance;

    const updateTime = new Date().toISOString();
    await db.collection<Tenant>("tenants").updateOne(
      { _id: new ObjectId(payment.tenantId) },
      {
        $set: {
          ...updateFields,
          updatedAt: updateTime,
        },
      }
    );

    const updatedTenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(payment.tenantId),
    });

    logger.info("Tenant payment fields updated", {
      tenantId: payment.tenantId,
      paymentId: payment._id,
      paymentType: payment.type,
      appliedAmount: payment.amount - remainingAmount,
      walletBalance: updatedTenant?.walletBalance,
    });

    return NextResponse.json({
      success: true,
      message: "Tenant payment fields updated successfully",
      payment: {
        _id: payment._id.toString(),
        tenantId: payment.tenantId,
        tenantName: tenant.name,
        amount: payment.amount,
        propertyId: payment.propertyId,
        paymentDate: payment.paymentDate,
        transactionId: payment.transactionId,
        status: payment.status,
        type: payment.type,
        reference: payment.reference,
      },
      tenant: {
        ...updatedTenant,
        _id: updatedTenant?._id.toString(),
      },
    }, { status: 200 });
  } catch (error: unknown) {
    logger.error("POST Update Payment Fields Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      userId,
      role,
    });
    return NextResponse.json(
      { success: false, message: "Server error while updating payment fields" },
      { status: 500 }
    );
  }
}

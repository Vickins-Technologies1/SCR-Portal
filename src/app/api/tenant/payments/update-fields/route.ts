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

    // Validate CSRF token
    if (!validateCsrfToken(request, paymentId)) {
      logger.error("Invalid CSRF token", { userId, paymentId });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    // Input validation
    if (!paymentId || !ObjectId.isValid(paymentId)) {
      logger.error("Invalid or missing paymentId", { paymentId });
      return NextResponse.json({ success: false, message: "Invalid or missing payment ID" }, { status: 400 });
    }
    if (submittedUserId !== userId) {
      logger.error("User ID mismatch", { submittedUserId, userId });
      return NextResponse.json({ success: false, message: "User ID mismatch" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    // Ensure indexes for performance
    await db.collection<Payment>("payments").createIndex({ _id: 1, tenantId: 1, status: 1, type: 1 });
    await db.collection<Tenant>("tenants").createIndex({ _id: 1, propertyId: 1 });
    await db.collection<Property>("properties").createIndex({ _id: 1, ownerId: 1 });

    // Find the payment
    const payment = await db.collection<Payment>("payments").findOne({
      _id: new ObjectId(paymentId),
    });

    if (!payment) {
      logger.error("Payment not found", { paymentId });
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    // Only process completed payments
    if (payment.status !== "completed") {
      logger.warn("Payment is not completed, skipping update", { paymentId, status: payment.status });
      return NextResponse.json({
        success: false,
        message: "Payment is not in completed status",
      }, { status: 400 });
    }

    // Validate property
    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(payment.propertyId),
      ownerId: userId,
    });
    if (!property) {
      logger.error("Property not found or not owned", { propertyId: payment.propertyId, userId });
      return NextResponse.json({ success: false, message: "Property not found or not owned" }, { status: 404 });
    }

    // Validate tenant and fetch current state
    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(payment.tenantId),
      propertyId: payment.propertyId,
    });
    if (!tenant) {
      logger.error("Tenant not found", { tenantId: payment.tenantId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Log tenant state before update
    logger.debug("Tenant state before update", {
      tenantId: payment.tenantId,
      paymentId,
      walletBalance: tenant.walletBalance,
      totalRentPaid: tenant.totalRentPaid,
      totalUtilityPaid: tenant.totalUtilityPaid,
      totalDepositPaid: tenant.totalDepositPaid,
      paymentType: payment.type,
      paymentAmount: payment.amount,
    });

    // Determine which field to update based on payment type
    const updateFields: Partial<Tenant> = {};
    switch (payment.type) {
      case "Rent":
        updateFields.totalRentPaid = (tenant.totalRentPaid || 0) + payment.amount;
        break;
      case "Utility":
        updateFields.totalUtilityPaid = (tenant.totalUtilityPaid || 0) + payment.amount;
        break;
      case "Deposit":
        updateFields.totalDepositPaid = (tenant.totalDepositPaid || 0) + payment.amount;
        break;
      case "Other":
        // "Other" payments do not update specific fields
        break;
      default:
        logger.warn("Invalid payment type", { paymentId, type: payment.type });
        return NextResponse.json({ success: false, message: "Invalid payment type" }, { status: 400 });
    }

    // Update tenant fields with timestamp
    const updateTime = new Date().toISOString();
    const updateResult = await db.collection<Tenant>("tenants").updateOne(
      {
        _id: new ObjectId(payment.tenantId),
        updatedAt: tenant.updatedAt || { $exists: false }, // Handle undefined updatedAt
      },
      {
        $set: {
          ...updateFields,
          updatedAt: updateTime,
        },
      }
    );

    if (updateResult.modifiedCount === 0) {
      // Check if the document exists but wasn't updated (possible concurrent update)
      const exists = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(payment.tenantId) });
      if (exists) {
        logger.warn("No changes made to tenant fields, possible concurrent update", {
          tenantId: payment.tenantId,
          paymentId,
          updatedAt: tenant.updatedAt,
        });
        return NextResponse.json(
          { success: false, message: "Failed to update tenant fields, possible concurrent update" },
          { status: 409 }
        );
      } else {
        logger.error("Tenant not found during update", { tenantId: payment.tenantId });
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }
    }

    // Fetch updated tenant state
    const updatedTenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(payment.tenantId),
    });

    if (!updatedTenant) {
      logger.error("Failed to fetch updated tenant", { tenantId: payment.tenantId });
      return NextResponse.json({ success: false, message: "Failed to fetch updated tenant data" }, { status: 500 });
    }

    // Recalculate totalRentPaid from payments to ensure consistency
    const payments = await db
      .collection<Payment>("payments")
      .find({
        tenantId: payment.tenantId,
        type: "Rent",
        status: "completed",
        createdAt: { $gte: tenant.leaseStartDate },
      })
      .toArray();
    const calculatedTotalRentPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    if (updatedTenant.totalRentPaid !== calculatedTotalRentPaid) {
      logger.warn("Discrepancy in totalRentPaid after update", {
        tenantId: payment.tenantId,
        storedTotalRentPaid: updatedTenant.totalRentPaid,
        calculatedTotalRentPaid,
      });
      await db.collection<Tenant>("tenants").updateOne(
        { _id: new ObjectId(payment.tenantId) },
        { $set: { totalRentPaid: calculatedTotalRentPaid, updatedAt: new Date().toISOString() } }
      );
      updatedTenant.totalRentPaid = calculatedTotalRentPaid;
    }

    logger.info("Tenant payment fields updated", {
      tenantId: payment.tenantId,
      paymentId,
      type: payment.type,
      amount: payment.amount,
      updateFields,
      previousState: {
        walletBalance: tenant.walletBalance,
        totalRentPaid: tenant.totalRentPaid,
        totalUtilityPaid: tenant.totalUtilityPaid,
        totalDepositPaid: tenant.totalDepositPaid,
      },
      newState: {
        walletBalance: updatedTenant.walletBalance,
        totalRentPaid: updatedTenant.totalRentPaid,
        totalUtilityPaid: updatedTenant.totalUtilityPaid,
        totalDepositPaid: updatedTenant.totalDepositPaid,
      },
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
        _id: updatedTenant._id.toString(),
        name: updatedTenant.name,
        email: updatedTenant.email,
        phone: updatedTenant.phone,
        propertyId: updatedTenant.propertyId,
        unitType: updatedTenant.unitType,
        houseNumber: updatedTenant.houseNumber,
        price: updatedTenant.price,
        deposit: updatedTenant.deposit,
        leaseStartDate: updatedTenant.leaseStartDate,
        leaseEndDate: updatedTenant.leaseEndDate,
        status: updatedTenant.status,
        paymentStatus: updatedTenant.paymentStatus,
        createdAt: updatedTenant.createdAt,
        updatedAt: updatedTenant.updatedAt,
        walletBalance: updatedTenant.walletBalance,
        totalRentPaid: updatedTenant.totalRentPaid,
        totalUtilityPaid: updatedTenant.totalUtilityPaid,
        totalDepositPaid: updatedTenant.totalDepositPaid,
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
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../../lib/csrf";
import logger from "../../../../../lib/logger";
import { generateTenantPaymentReceiptPdf } from "@/lib/tenant-payment-receipt-pdf";
import { paymentTypeLabel, type TenantPaymentType } from "@/lib/payment-types";

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "pending_stk" | "failed";
  createdAt: string;
  type?: TenantPaymentType;
  phoneNumber?: string;
  reference?: string;
  mpesaCode?: string;
  method?: string;
  provider?: string;
  remainingBalance?: number;
}

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
  houseNumber?: string;
  unit?: string;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
  address?: string;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("paymentId");

  if (!userId || !role || !["admin", "propertyOwner", "tenant"].includes(role)) {
    logger.error("Unauthorized access attempt", { userId, role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!validateCsrfToken(request, csrfToken)) {
    logger.error("Invalid CSRF token", { userId });
    return buildInvalidCsrfResponse(request);
  }

  if (!paymentId || !ObjectId.isValid(paymentId)) {
    logger.error("Invalid or missing payment ID", { paymentId });
    return NextResponse.json({ success: false, message: "Valid payment ID is required" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const payment = await db.collection<Payment>("payments").findOne({ _id: new ObjectId(paymentId) });
    if (!payment || payment.status !== "completed") {
      logger.error("Payment not found or not completed", { paymentId, userId, status: payment?.status });
      return NextResponse.json({ success: false, message: "Payment not found or not completed" }, { status: 404 });
    }

    // Validate tenant ownership or admin access
    if (role === "tenant" && payment.tenantId !== userId) {
      logger.error("Unauthorized tenant access to payment", { userId, tenantId: payment.tenantId, paymentId });
      return NextResponse.json({ success: false, message: "Unauthorized access to payment" }, { status: 403 });
    }

    const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(payment.tenantId) });
    if (!tenant) {
      logger.error("Tenant not found", { tenantId: payment.tenantId, paymentId });
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const property = await db.collection<Property>("properties").findOne({ _id: new ObjectId(payment.propertyId) });
    if (!property) {
      logger.error("Property not found", { propertyId: payment.propertyId, paymentId });
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    const pdfBytes = await generateTenantPaymentReceiptPdf({
      payment: {
        receiptNumber: payment._id.toString(), amount: payment.amount, propertyId: payment.propertyId,
        paymentDate: payment.paymentDate, transactionId: payment.transactionId, status: payment.status,
        type: paymentTypeLabel(payment.type), phoneNumber: payment.phoneNumber, reference: payment.reference,
        mpesaCode: payment.mpesaCode, method: payment.method || payment.provider || (payment.mpesaCode ? "M-Pesa" : "Recorded payment"),
        remainingBalance: payment.remainingBalance,
      },
      tenant: { name: tenant.name, email: tenant.email, phone: tenant.phone, houseNumber: tenant.houseNumber },
      property: { name: property.name, address: property.address },
    });
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    logger.debug("Receipt generated successfully", { paymentId, userId, role });
    return NextResponse.json(
      { success: true, pdf: pdfBase64 },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("GET Receipt Error", {
      message: error instanceof Error ? error.message : "Unknown error",
      paymentId,
      userId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error while generating receipt" }, { status: 500 });
  }
}

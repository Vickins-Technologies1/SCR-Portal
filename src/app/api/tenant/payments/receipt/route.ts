import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { ObjectId, Db } from "mongodb";
import { validateCsrfToken } from "../../../../../lib/csrf";
import logger from "../../../../../lib/logger";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber?: string;
  reference?: string;
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
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
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
    logger.error("Invalid CSRF token", { userId, csrfToken, cookies: request.cookies.getAll() });
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
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

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 12;
    const titleFontSize = 24;
    const margin = 50;
    const topMargin = 180; // Margin top to accommodate the logo in the image

    // Read the background image from the public directory
    const imagePath = path.join(process.cwd(), "public", "bg.png");
    const imageBuffer = fs.readFileSync(imagePath);
    const backgroundImageBase64 = `data:image/png;base64,${imageBuffer.toString("base64")}`;
    const backgroundImageBytes = Uint8Array.from(atob(backgroundImageBase64.split(',')[1]), c => c.charCodeAt(0));
    const backgroundImage = await pdfDoc.embedPng(backgroundImageBytes);
    page.drawImage(backgroundImage, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    const titleColor = rgb(0.0039, 0.1647, 0.2902);
    const textColor = rgb(0, 0, 0); // Black text for contrast

    page.drawText("Payment Receipt", {
      x: margin,
      y: height - topMargin - titleFontSize,
      size: titleFontSize,
      font: boldFont,
      color: titleColor,
    });

    const details = [
      { label: "Receipt ID", value: payment._id.toString() },
      { label: "Tenant Name", value: tenant.name || "Unknown" },
      { label: "Email", value: tenant.email || "N/A" },
      { label: "Phone", value: tenant.phone || "N/A" },
      { label: "Property", value: property.name || "N/A" },
      { label: "Amount", value: `KES ${payment.amount.toFixed(2)}` },
      { label: "Payment Type", value: payment.type || "Other" },
      { label: "Status", value: payment.status.charAt(0).toUpperCase() + payment.status.slice(1) },
      { label: "Transaction ID", value: payment.transactionId },
      { label: "Payment Date", value: new Date(payment.paymentDate).toLocaleDateString() },
      { label: "Reference", value: payment.reference || "N/A" },
    ];

    let y = height - topMargin - titleFontSize - 50;
    for (const { label, value } of details) {
      page.drawText(`${label}:`, { x: margin, y, size: fontSize, font: boldFont, color: textColor });
      page.drawText(value, { x: margin + 100, y, size: fontSize, font, color: textColor });
      y -= fontSize + 10;
    }

    const pdfBytes = await pdfDoc.save();
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
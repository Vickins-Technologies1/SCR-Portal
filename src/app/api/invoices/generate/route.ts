import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import * as fs from "fs";
import * as path from "path";

interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Only admins can generate invoices" },
        { status: 401 }
      );
    }

    const csrfToken = request.headers.get("X-CSRF-Token");
    const storedCsrfToken = request.cookies.get("csrf-token")?.value;
    if (!csrfToken || csrfToken !== storedCsrfToken) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing CSRF token" },
        { status: 403 }
      );
    }

    const { invoiceId } = await request.json();
    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      return NextResponse.json(
        { success: false, message: "Valid invoice ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const invoice: Invoice | null = await db.collection<Invoice>("invoices").findOne({
      _id: new ObjectId(invoiceId),
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 }
      );
    }

    // Fetch user and property details for PDF
    const user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(invoice.userId) });
    const property = await db.collection("properties").findOne({ _id: new ObjectId(invoice.propertyId) });

    // Generate PDF with background image from public directory
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 12;
    const titleFontSize = 24;
    const margin = 50;
    const topMargin = 180; // Margin top to accommodate the logo in the image

    // Read the image from the public directory and convert to base64
    const imagePath = path.join(process.cwd(), "public", "bg.png"); // Adjust filename as needed
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

    page.drawText("Property Management Invoice", {
      x: margin,
      y: height - topMargin - titleFontSize,
      size: titleFontSize,
      font: boldFont,
      color: titleColor,
    });

    const details = [
      { label: "Invoice ID", value: invoice._id.toString() },
      { label: "Property Owner", value: user?.email || "N/A" },
      { label: "Property", value: property?.name || "N/A" },
      { label: "Amount", value: `Ksh ${invoice.amount.toFixed(2)}` },
      { label: "Status", value: invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) },
      { label: "Reference", value: invoice.reference },
      { label: "Created At", value: invoice.createdAt.toLocaleDateString() },
      { label: "Expires At", value: invoice.expiresAt.toLocaleDateString() },
      { label: "Description", value: invoice.description },
    ];

    let y = height - topMargin - titleFontSize - 50;
    for (const { label, value } of details) {
      page.drawText(`${label}:`, { x: margin, y, size: fontSize, font: boldFont, color: textColor });
      page.drawText(value, { x: margin + 100, y, size: fontSize, font, color: textColor });
      y -= fontSize + 10;
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    return NextResponse.json(
      { success: true, pdf: pdfBase64 },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error generating invoice PDF:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Failed to generate invoice PDF" },
      { status: 500 }
    );
  }
}
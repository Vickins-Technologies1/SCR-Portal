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
  expiresAt: Date;
  description: string;
  items?: Array<{ description: string; qty: number; rate: number }>;
  discount?: number;
  tax?: number;
}

export async function POST(request: NextRequest) {
  try {
    // === AUTH ===
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    const csrf = request.headers.get("X-CSRF-Token");
    const storedCsrf = request.cookies.get("csrf-token")?.value;

    if (!userId || role !== "admin" || csrf !== storedCsrf) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { invoiceId } = await request.json();
    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      return NextResponse.json({ success: false, message: "Invalid invoice ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const invoice = await db.collection<Invoice>("invoices").findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(invoice.userId) });
    const property = await db.collection("properties").findOne({ _id: new ObjectId(invoice.propertyId) });

    // === PDF SETUP ===
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const size = 10;
    const line = 15;
    let y = height - 220;

    // === BACKGROUND (with logo + header) ===
    const bgPath = path.join(process.cwd(), "public", "bg.png");
    if (!fs.existsSync(bgPath)) {
      return NextResponse.json({ success: false, message: "bg.png missing" }, { status: 500 });
    }
    const bgImage = await pdfDoc.embedPng(fs.readFileSync(bgPath));
    page.drawImage(bgImage, { x: 0, y: 0, width, height });

    // === RIGHT COLUMN: DATE & INVOICE NO. (Perfectly Aligned) ===
    const rightX = 400;
    const valueX = 480;

    y = height - 165;
    page.drawText("DATE", { x: rightX, y, size, font: bold, color: rgb(0, 0, 0) });
    page.drawText(new Date().toLocaleDateString("en-GB"), { x: valueX, y, size, font, color: rgb(0, 0, 0) });

    y -= line;
    page.drawText("INVOICE NO.", { x: rightX, y, size, font: bold, color: rgb(0, 0, 0) });

    // Generate 5-digit invoice number
    const shortInvoiceNo = invoice.reference?.slice(-5) || 
      String(Math.floor(10000 + Math.random() * 90000)); // e.g. 76543

    page.drawText(shortInvoiceNo, { x: valueX, y, size, font, color: rgb(0, 0, 0) });

    // === BILL TO ===
    y = height - 290;
    page.drawText("BILL TO", { x: 50, y, size, font: bold });
    y -= line;
    page.drawText(owner?.name || "Property Owner", { x: 50, y, size, font });
    y -= line;
    page.drawText(property?.name || "N/A", { x: 50, y, size, font });
    y -= line;
    page.drawText(owner?.email || "N/A", { x: 50, y, size, font });
    y -= line;
    page.drawText(owner?.phone || "N/A", { x: 50, y, size, font });

    // === TABLE ===
    y -= 35;
    const tableY = y;
    const cols = { desc: 50, qty: 310, rate: 400, total: 480 };

    // Dark Blue Header (#01294a)
    page.drawRectangle({
      x: 50, y: y - 5, width: 495, height: 22,
      color: rgb(0.0039, 0.1647, 0.2902), // #01294a
      opacity: 1,
    });

    const headerY = y + 4;
    page.drawText("DESCRIPTION", { x: cols.desc + 5, y: headerY, size, font: bold, color: rgb(1, 1, 1) });
    page.drawText("QTY", { x: cols.qty + 10, y: headerY, size, font: bold, color: rgb(1, 1, 1) });
    page.drawText("UNIT PRICE", { x: cols.rate + 5, y: headerY, size, font: bold, color: rgb(1, 1, 1) });
    page.drawText("TOTAL", { x: cols.total + 10, y: headerY, size, font: bold, color: rgb(1, 1, 1) });

    y -= 28;

    // === TABLE ROWS ===
    const items = invoice.items || [
      { description: invoice.description || "Property Management Fee", qty: 1, rate: invoice.amount }
    ];

    for (const item of items) {
      const total = item.qty * item.rate;
      const desc = item.description.length > 42 ? item.description.slice(0, 39) + "..." : item.description;

      page.drawText(desc, { x: cols.desc + 5, y: y + 2, size, font });
      page.drawText(item.qty.toString(), { x: cols.qty + 15, y: y + 2, size, font });
      page.drawText(`Ksh ${item.rate.toFixed(2)}`, { x: cols.rate + 5, y: y + 2, size, font });
      page.drawText(`Ksh ${total.toFixed(2)}`, { x: cols.total + 5, y: y + 2, size, font });
      y -= line + 3;
    }

    // === TOTALS BOX ===
    const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
    const discount = invoice.discount || 0;
    const tax = invoice.tax || 0;
    const balance = subtotal - discount + tax;

    y = tableY - 110;
    const boxX = 350;

    const drawTotal = (label: string, amount: number, isBold = false) => {
      page.drawText(label, { x: boxX, y, size, font: isBold ? bold : font });
      page.drawText(`Ksh ${amount.toFixed(2)}`, { x: 480, y, size, font: isBold ? bold : font });
      y -= line;
    };

    drawTotal("SUBTOTAL", subtotal);
    drawTotal("DISCOUNT", discount);
    drawTotal("TAX RATE", tax);

    // Dark Blue "BALANCE DUE" box
    page.drawRectangle({
      x: boxX - 10, y: y - 10, width: 205, height: 24,
      color: rgb(0.0039, 0.1647, 0.2902), // #01294a
    });
    // Draw "BALANCE DUE" in white
    page.drawText("BALANCE DUE", { x: boxX, y, size, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`Ksh ${balance.toFixed(2)}`, { x: 480, y, size, font: bold, color: rgb(1, 1, 1) });
    y -= line;

    // === PAYMENT INSTRUCTIONS ===
    y -= 50;
    page.drawText("Remarks / Payment Instructions:", { x: 50, y, size, font: bold });
    y -= line;
    page.drawText("Make all checks payable to Smart Choice Rental Management", { x: 50, y, size, font });
    y -= line;
    page.drawText("M-PESA Paybill: 522533 | Account: " + shortInvoiceNo, { x: 50, y, size, font });
    y -= line;
    page.drawText("Bank: KCB | A/C: 7726486", { x: 50, y, size, font });

    // === SIGNATURE ===
    y -= 35;
    page.drawText("Client Signature ________________________ X", { x: 50, y, size, font });

    // === THANK YOU ===
    page.drawText("Thank you for your business!", {
      x: 50, y: 45, size: 12, font: bold,
      color: rgb(0.0039, 0.1647, 0.2902),
    });

    // === RETURN PDF ===
    const pdfBytes = await pdfDoc.save();
    return NextResponse.json({
      success: true,
      pdf: Buffer.from(pdfBytes).toString("base64"),
      invoiceNumber: shortInvoiceNo,
    });

  } catch (error: any) {
    console.error("PDF Generation Failed:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
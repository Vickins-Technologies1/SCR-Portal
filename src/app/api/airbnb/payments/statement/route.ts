import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { getMonthRange, parseDate } from "@/lib/airbnb-utils";
import { ObjectId } from "mongodb";
import * as fs from "fs";
import * as path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  const { start, end } = getMonthRange();
  const periodLabel = `${start.toLocaleDateString("en-KE", { month: "long", year: "numeric" })}`;

  const payoutsRaw = await db
    .collection("airbnbPayouts")
    .find({ ownerId, status: "paid" })
    .sort({ createdAt: -1 })
    .toArray();

  const directPaymentsRaw = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect", status: "completed" })
    .sort({ paymentDate: -1 })
    .toArray();

  const inRange = (value?: string | Date | null) => {
    const parsed = parseDate(value || null);
    if (!parsed) return false;
    return parsed >= start && parsed <= end;
  };

  const payouts = payoutsRaw.filter((payout) => inRange(payout.createdAt || payout.period));
  const directPayments = directPaymentsRaw.filter((payment) => inRange(payment.paymentDate || payment.createdAt));

  const owner = ObjectId.isValid(ownerId)
    ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) })
    : null;

  const rows = [
    ...payouts.map((payout) => ({
      propertyName: payout.propertyName || "Airbnb Listing",
      period: payout.period || new Date(payout.createdAt || Date.now()).toLocaleDateString("en-KE"),
      amount: Number(payout.amount || 0),
      status: payout.status || "scheduled",
      method: payout.method || "M-Pesa",
    })),
    ...directPayments.map((payment) => ({
      propertyName: payment.propertyName || payment.listingName || "Direct Booking",
      period: payment.paymentDate
        ? new Date(payment.paymentDate).toLocaleDateString("en-KE", { month: "short", day: "numeric" })
        : "Direct payment",
      amount: Number(payment.amount || 0),
      status: payment.status === "completed" ? "paid" : payment.status === "failed" ? "failed" : "processing",
      method: "M-Pesa",
    })),
  ];

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let currentPage = pdfDoc.addPage([595, 842]);
  let { width, height } = currentPage.getSize();

  const bgPath = path.join(process.cwd(), "public", "bg.png");
  if (fs.existsSync(bgPath)) {
    const bgImage = await pdfDoc.embedPng(fs.readFileSync(bgPath));
    currentPage.drawImage(bgImage, { x: 0, y: 0, width, height });
  }

  const drawHeader = (currentPage: any) => {
    currentPage.drawText("Airbnb Owner Statement", {
      x: 50,
      y: height - 120,
      size: 20,
      font: bold,
      color: rgb(0.01, 0.16, 0.29),
    });
    currentPage.drawText(`Period: ${periodLabel}`, { x: 50, y: height - 145, size: 10, font });
    currentPage.drawText(`Generated: ${new Date().toLocaleString("en-KE")}`, {
      x: 50,
      y: height - 160,
      size: 9,
      font,
    });
    currentPage.drawText(owner?.name || "Property Owner", { x: 400, y: height - 145, size: 10, font: bold });
    currentPage.drawText(owner?.email || "support@soranapropertymanagers.com", { x: 400, y: height - 160, size: 9, font });
  };

  drawHeader(currentPage);

  let y = height - 210;
  const tableX = 50;
  const col = { property: tableX, period: tableX + 200, amount: tableX + 320, status: tableX + 400, method: tableX + 480 };

  const drawTableHeader = (currentPage: any) => {
    currentPage.drawRectangle({ x: tableX, y: y - 6, width: 495, height: 20, color: rgb(0.01, 0.16, 0.29) });
    currentPage.drawText("Property", { x: col.property + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Period", { x: col.period + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Amount", { x: col.amount + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Status", { x: col.status + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Method", { x: col.method + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    y -= 26;
  };

  drawTableHeader(currentPage);

  for (const row of rows) {
    if (y < 90) {
      currentPage = pdfDoc.addPage([595, 842]);
      ({ width, height } = currentPage.getSize());
      if (fs.existsSync(bgPath)) {
        const bgImage = await pdfDoc.embedPng(fs.readFileSync(bgPath));
        currentPage.drawImage(bgImage, { x: 0, y: 0, width, height });
      }
      drawHeader(currentPage);
      y = height - 210;
      drawTableHeader(currentPage);
    }

    currentPage.drawText(row.propertyName.slice(0, 28), { x: col.property + 4, y, size: 9, font });
    currentPage.drawText(row.period.toString().slice(0, 16), { x: col.period + 4, y, size: 9, font });
    currentPage.drawText(`Ksh ${row.amount.toLocaleString("en-KE")}`, { x: col.amount + 4, y, size: 9, font });
    currentPage.drawText(String(row.status).slice(0, 10), { x: col.status + 4, y, size: 9, font });
    currentPage.drawText(String(row.method).slice(0, 10), { x: col.method + 4, y, size: 9, font });
    y -= 18;
  }

  currentPage.drawText(`Total: Ksh ${totalAmount.toLocaleString("en-KE")}`, {
    x: 50,
    y: 60,
    size: 11,
    font: bold,
    color: rgb(0.01, 0.16, 0.29),
  });

  const pdfBytes = await pdfDoc.save();
  return NextResponse.json({
    success: true,
    pdf: Buffer.from(pdfBytes).toString("base64"),
    filename: `airbnb-owner-statement-${start.toISOString().slice(0, 10)}.pdf`,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { getMonthRange, parseDate } from "@/lib/airbnb-utils";
import { ObjectId } from "mongodb";
import { A4_PAGE_SIZE, PDF_TEMPLATE_SAFE_AREA, applyPdfTemplate, embedTemplateImage } from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

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
      mpesaCode: payout.mpesaCode || payout.mpesaReceiptNumber || payout.reference || "",
    })),
    ...directPayments.map((payment) => ({
      propertyName: payment.propertyName || payment.listingName || "Direct Booking",
      period: payment.paymentDate
        ? new Date(payment.paymentDate).toLocaleDateString("en-KE", { month: "short", day: "numeric" })
        : "Direct payment",
      amount: Number(payment.amount || 0),
      status: payment.status === "completed" ? "paid" : payment.status === "failed" ? "failed" : "processing",
      method: "M-Pesa",
      mpesaCode: payment.mpesaCode || payment.mpesaReceiptNumber || payment.reference || "",
    })),
  ];

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const templateBytes = getPdfTemplateBytes();
  const templateImage = await embedTemplateImage(pdfDoc, templateBytes);

  let currentPage = pdfDoc.addPage(A4_PAGE_SIZE);

  const { safeArea, contentTopY } = await applyPdfTemplate({
    pdfDoc,
    page: currentPage,
    backgroundBytes: templateBytes,
    backgroundImage: templateImage,
    safeArea: PDF_TEMPLATE_SAFE_AREA,
  });

  const drawHeader = (currentPage: any) => {
    currentPage.drawText("Airbnb Owner Statement", {
      x: 50,
      y: contentTopY,
      size: 20,
      font: bold,
      color: rgb(0.01, 0.16, 0.29),
    });
    currentPage.drawText(`Period: ${periodLabel}`, { x: 50, y: contentTopY - 25, size: 10, font });
    currentPage.drawText(`Generated: ${new Date().toLocaleString("en-KE")}`, {
      x: 50,
      y: contentTopY - 40,
      size: 9,
      font,
    });
    currentPage.drawText(owner?.name || "Property Owner", { x: 400, y: contentTopY - 25, size: 10, font: bold });
    currentPage.drawText(owner?.email || "support@soranapropertymanagers.com", { x: 400, y: contentTopY - 40, size: 9, font });
  };

  drawHeader(currentPage);

  let y = contentTopY - 90;
  const tableX = 50;
  const col = {
    property: tableX,
    period: tableX + 145,
    amount: tableX + 225,
    status: tableX + 295,
    method: tableX + 355,
    mpesaCode: tableX + 410,
  };

  const drawTableHeader = (currentPage: any) => {
    currentPage.drawRectangle({ x: tableX, y: y - 6, width: 495, height: 20, color: rgb(0.01, 0.16, 0.29) });
    currentPage.drawText("Property", { x: col.property + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Period", { x: col.period + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Amount", { x: col.amount + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Status", { x: col.status + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("Method", { x: col.method + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    currentPage.drawText("M-Pesa Code", { x: col.mpesaCode + 4, y: y, size: 9, font: bold, color: rgb(1, 1, 1) });
    y -= 26;
  };

  drawTableHeader(currentPage);

  for (const row of rows) {
    if (y < safeArea.bottom + 40) {
      currentPage = pdfDoc.addPage(A4_PAGE_SIZE);
      await applyPdfTemplate({
        pdfDoc,
        page: currentPage,
        backgroundBytes: templateBytes,
        backgroundImage: templateImage,
        safeArea: PDF_TEMPLATE_SAFE_AREA,
      });
      drawHeader(currentPage);
      y = contentTopY - 90;
      drawTableHeader(currentPage);
    }

    currentPage.drawText(row.propertyName.slice(0, 28), { x: col.property + 4, y, size: 9, font });
    currentPage.drawText(row.period.toString().slice(0, 14), { x: col.period + 4, y, size: 9, font });
    currentPage.drawText(`Ksh ${row.amount.toLocaleString("en-KE")}`, { x: col.amount + 4, y, size: 9, font });
    currentPage.drawText(String(row.status).slice(0, 10), { x: col.status + 4, y, size: 9, font });
    currentPage.drawText(String(row.method).slice(0, 9), { x: col.method + 4, y, size: 9, font });
    currentPage.drawText(String(row.mpesaCode || "—").slice(0, 14), { x: col.mpesaCode + 4, y, size: 9, font });
    y -= 18;
  }

  currentPage.drawText(`Total: Ksh ${totalAmount.toLocaleString("en-KE")}`, {
    x: 50,
    y: safeArea.bottom + 10,
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

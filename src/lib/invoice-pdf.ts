import "server-only";

import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { A4_PAGE_SIZE, applyPdfTemplate } from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";
import { calculateInvoiceTotals, type InvoiceCalculation } from "@/lib/invoice-calculations";

export type InvoicePdfOwner = { name?: string | null; email?: string | null; phone?: string | null };
export type InvoicePdfProperty = { name?: string | null; address?: string | null };
export type InvoicePdfInvoice = {
  reference?: string | null; amount: number; description?: string | null;
  items?: Array<{ description: string; qty: number; rate: number }> | null;
  discount?: number | null; tax?: number | null; dueDate?: Date | string | null; amountPaid?: number | null;
};

const navy = rgb(0.03, 0.16, 0.29), slate = rgb(0.34, 0.40, 0.47), light = rgb(0.94, 0.96, 0.98);
const green = rgb(0.08, 0.48, 0.28), amber = rgb(0.65, 0.39, 0.04), red = rgb(0.68, 0.16, 0.14);
const money = (value: number) => `Ksh ${value.toFixed(2)}`;
const safeText = (value: unknown, fallback = "—") => String(value ?? "").trim() || fallback;
const truncate = (text: string, max: number) => text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;

function drawRight(page: PDFPage, text: string, right: number, y: number, size: number, font: any, color = navy) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}
function drawLabel(page: PDFPage, text: string, x: number, y: number, font: any) {
  page.drawText(text, { x, y, size: 7.5, font, color: slate });
}

export async function generateInvoicePdf(params: {
  invoice: InvoicePdfInvoice; owner: InvoicePdfOwner; property: InvoicePdfProperty | null; now?: Date;
}): Promise<{ pdfBytes: Uint8Array; invoiceNumber: string; calculation: InvoiceCalculation }> {
  const { invoice, owner, property } = params;
  const now = params.now ?? new Date();
  const calculation = calculateInvoiceTotals({ ...invoice, now });
  const invoiceNumber = safeText(invoice.reference, "INV");
  const invoiceIdDigits = invoiceNumber.replace(/\D/g, "");
  const displayInvoiceId = (invoiceIdDigits.slice(-8) || "0").padStart(8, "0");
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica), bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage(A4_PAGE_SIZE);
  const { safeArea } = await applyPdfTemplate({ pdfDoc, page, backgroundBytes: getPdfTemplateBytes() });
  const left = safeArea.left, right = A4_PAGE_SIZE[0] - safeArea.right, width = right - left;
  let y = A4_PAGE_SIZE[1] - safeArea.top - 4;

  page.drawText("INVOICE", { x: left, y, size: 22, font: bold, color: navy });
  const badgeColor = calculation.status === "PAID" ? green : calculation.status === "OVERDUE" ? red : amber;
  const badgeWidth = bold.widthOfTextAtSize(calculation.status, 8) + 22;
  page.drawRectangle({ x: right - badgeWidth, y: y - 2, width: badgeWidth, height: 18, color: badgeColor });
  page.drawText(calculation.status, { x: right - badgeWidth + 11, y: y + 3, size: 8, font: bold, color: rgb(1, 1, 1) });
  y -= 24; page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: light }); y -= 18;
  const metaX = right - 190;
  drawLabel(page, "INVOICE NUMBER", metaX, y, regular); drawRight(page, displayInvoiceId, right, y, 9, bold); y -= 15;
  drawLabel(page, "ISSUE DATE", metaX, y, regular); drawRight(page, now.toLocaleDateString("en-KE"), right, y, 9, regular); y -= 15;
  drawLabel(page, "DUE DATE", metaX, y, regular);
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  drawRight(page, dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toLocaleDateString("en-KE") : "Not specified", right, y, 9, regular);

  y -= 30; page.drawRectangle({ x: left, y: y - 56, width, height: 66, color: light, opacity: 0.48 });
  drawLabel(page, "BILL TO", left + 14, y - 7, bold);
  page.drawText(truncate(safeText(owner.name, "Property Owner"), 48), { x: left + 14, y: y - 25, size: 11, font: bold, color: navy });
  page.drawText(truncate(safeText(property?.name, "Property"), 52), { x: left + 14, y: y - 40, size: 8.5, font: regular, color: navy });
  if (property?.address) page.drawText(truncate(property.address, 52), { x: left + 14, y: y - 52, size: 8, font: regular, color: slate });
  page.drawText(truncate(safeText(owner.email), 42), { x: left + 260, y: y - 25, size: 8.5, font: regular, color: navy });
  page.drawText(truncate(safeText(owner.phone), 32), { x: left + 260, y: y - 40, size: 8.5, font: regular, color: slate });
  y -= 82;

  const cols = { rate: left + 375, total: right };
  page.drawRectangle({ x: left, y: y - 5, width, height: 20, color: navy });
  page.drawText("DESCRIPTION", { x: left + 9, y: y + 2, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  drawRight(page, "QTY", cols.rate - 24, y + 2, 7.5, bold, rgb(1, 1, 1));
  drawRight(page, "UNIT PRICE", cols.total - 75, y + 2, 7.5, bold, rgb(1, 1, 1));
  drawRight(page, "TOTAL", right - 9, y + 2, 7.5, bold, rgb(1, 1, 1)); y -= 20;
  const items = invoice.items?.length ? invoice.items : [{ description: invoice.description || "Property Management Fee", qty: 1, rate: invoice.amount }];
  items.forEach((item, index) => {
    const rowY = y - index * 19;
    if (index % 2 === 0) page.drawRectangle({ x: left, y: rowY - 5, width, height: 19, color: rgb(0.985, 0.99, 1) });
    page.drawText(truncate(safeText(item.description, "Service"), 55), { x: left + 9, y: rowY + 1, size: 8.5, font: regular, color: navy });
    drawRight(page, String(Number(item.qty) || 0), cols.rate - 24, rowY + 1, 8.5, regular);
    drawRight(page, money(Math.max(0, Number(item.rate) || 0)), cols.total - 75, rowY + 1, 8.5, regular);
    drawRight(page, money(Math.max(0, (Number(item.qty) || 0) * (Number(item.rate) || 0))), right - 9, rowY + 1, 8.5, regular);
  });
  y -= items.length * 19 + 18;

  const summaryX = right - 205;
  page.drawLine({ start: { x: summaryX, y: y + 7 }, end: { x: right, y: y + 7 }, thickness: 0.7, color: light });
  const summaryRow = (label: string, amount: number, emphasis = false) => {
    page.drawText(label, { x: summaryX, y, size: emphasis ? 10 : 8.5, font: emphasis ? bold : regular, color: emphasis ? navy : slate });
    drawRight(page, money(amount), right, y, emphasis ? 10 : 8.5, emphasis ? bold : regular, emphasis ? navy : slate); y -= emphasis ? 19 : 15;
  };
  summaryRow("Subtotal", calculation.subtotal); summaryRow("Discount", calculation.discount); summaryRow("Tax", calculation.tax);
  summaryRow("TOTAL", calculation.total, true); summaryRow("Amount Paid", calculation.amountPaid); summaryRow("Balance Due", calculation.balanceDue, true);

  const footerY = safeArea.bottom + 10;
  page.drawText("Thank you for your business.", { x: left, y: footerY + 12, size: 9, font: bold, color: navy });
  page.drawText("Sorana Property Managers Ltd  ·  soranapropertymanagers@gmail.com  ·  soranapropertymanagers.com", { x: left, y: footerY, size: 6.5, font: regular, color: slate });
  return { pdfBytes: await pdfDoc.save(), invoiceNumber, calculation };
}

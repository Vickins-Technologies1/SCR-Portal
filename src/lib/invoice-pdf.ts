import "server-only";

import { PDFDocument, PDFPage } from "pdf-lib";
import {
  A4_PAGE_SIZE,
  applyPdfTemplate,
  drawPdfTableHeader,
  drawPdfTableRow,
  drawPdfWrappedText,
  embedPdfFonts,
  embedTemplateImage,
  finalizePdfDocument,
  formatPdfDate,
  formatPdfMoney,
  measurePdfTableRow,
  PDF_COLORS,
  PDF_TEMPLATE_SAFE_AREA,
  type PdfFonts,
  type PdfTableColumn,
  sanitizePdfText,
} from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";
import { calculateInvoiceTotals, type InvoiceCalculation } from "@/lib/invoice-calculations";

export type InvoicePdfOwner = { name?: string | null; email?: string | null; phone?: string | null };
export type InvoicePdfProperty = { name?: string | null; address?: string | null };
export type InvoicePdfInvoice = {
  reference?: string | null; amount: number; description?: string | null;
  billingPlan?: string | null;
  items?: Array<{ description: string; qty: number; rate: number }> | null;
  discount?: number | null; tax?: number | null; dueDate?: Date | string | null; amountPaid?: number | null;
};

function resolveInvoicePrefix(invoice: InvoicePdfInvoice): string {
  const plan = String(invoice.billingPlan || "").toLowerCase();
  if (plan === "fullmanagement" || plan.includes("full management")) return "FM";
  if (plan === "rentcollection" || plan.includes("software") || plan.includes("lease")) return "SL";
  if (plan.includes("lifetime") || plan === "lifetimepurchase") return "LT";
  const referencePrefix = String(invoice.reference || "").match(/(?:^|[-_])(FM|SL|LT)(?:[-_]|$)/i)?.[1];
  return referencePrefix?.toUpperCase() || "INV";
}

const tableColumns: PdfTableColumn[] = [
  { label: "Description", width: 255 },
  { label: "Qty", width: 48, align: "right" },
  { label: "Unit price", width: 100, align: "right" },
  { label: "Amount", width: 104, align: "right" },
];

function drawPair(page: PDFPage, fonts: PdfFonts, label: string, value: string, x: number, y: number, valueRight: number) {
  page.drawText(label, { x, y, size: 7, font: fonts.regular, color: PDF_COLORS.muted });
  const safe = sanitizePdfText(value);
  const valueSize = 8;
  const valueWidth = Math.min(112, valueRight - x - 68);
  drawPdfWrappedText(page, safe, { x: valueRight - valueWidth, y, width: valueWidth, font: fonts.regular, size: valueSize, lineHeight: 9, color: PDF_COLORS.navy });
}

async function addPage(pdfDoc: PDFDocument, logoBytes: Uint8Array, logo: Awaited<ReturnType<typeof embedTemplateImage>>) {
  const page = pdfDoc.addPage(A4_PAGE_SIZE);
  const area = await applyPdfTemplate({ pdfDoc, page, backgroundBytes: logoBytes, backgroundImage: logo });
  return { page, top: area.contentTopY, bottom: area.contentBottomY };
}

export async function generateInvoicePdf(params: {
  invoice: InvoicePdfInvoice; owner: InvoicePdfOwner; property: InvoicePdfProperty | null; now?: Date;
}): Promise<{ pdfBytes: Uint8Array; invoiceNumber: string; calculation: InvoiceCalculation }> {
  const { invoice, owner, property } = params;
  const now = params.now ?? new Date();
  const calculation = calculateInvoiceTotals({ ...invoice, now });
  const invoiceNumber = sanitizePdfText(invoice.reference, "INV");
  const invoiceIdDigits = invoiceNumber.replace(/\D/g, "");
  const displayInvoiceId = `${resolveInvoicePrefix(invoice)}-${(invoiceIdDigits.slice(-8) || "0").padStart(8, "0")}`;
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdfDoc);
  const logoBytes = getPdfTemplateBytes();
  const logo = await embedTemplateImage(pdfDoc, logoBytes);
  const left = PDF_TEMPLATE_SAFE_AREA.left;
  const right = A4_PAGE_SIZE[0] - PDF_TEMPLATE_SAFE_AREA.right;
  const badgeColor = calculation.status === "PAID" ? PDF_COLORS.green : calculation.status === "OVERDUE" ? PDF_COLORS.red : PDF_COLORS.amber;

  const drawHeader = async (page: PDFPage, top: number, continued: boolean) => {
    page.drawText(continued ? "MANAGEMENT INVOICE - CONTINUED" : "MANAGEMENT INVOICE", {
      x: left, y: top - 8, size: continued ? 14 : 16, font: fonts.bold, color: PDF_COLORS.navy,
    });
    if (continued) {
      page.drawText(`Invoice ${displayInvoiceId}`, { x: left, y: top - 27, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
      return drawPdfTableHeader(page, left, top - 44, tableColumns, fonts.bold);
    }

    const badgeWidth = fonts.bold.widthOfTextAtSize(calculation.status, 7) + 14;
    page.drawRectangle({ x: right - badgeWidth, y: top - 22, width: badgeWidth, height: 15, color: badgeColor });
    page.drawText(calculation.status, { x: right - badgeWidth + 7, y: top - 17, size: 7, font: fonts.bold, color: PDF_COLORS.white });
    drawPair(page, fonts, "INVOICE NO.", displayInvoiceId, right - 190, top - 8, right);
    drawPair(page, fonts, "ISSUED", formatPdfDate(now), right - 190, top - 23, right);
    drawPair(page, fonts, "DUE DATE", formatPdfDate(invoice.dueDate), right - 190, top - 38, right);

    page.drawLine({ start: { x: left, y: top - 52 }, end: { x: right, y: top - 52 }, thickness: 0.6, color: PDF_COLORS.line });
    let infoY = top - 67;
    page.drawText("BILL TO", { x: left, y: infoY, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
    page.drawText("PROPERTY", { x: left + 266, y: infoY, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
    infoY -= 14;
    const ownerName = drawPdfWrappedText(page, owner.name || "Property Owner", { x: left, y: infoY, width: 242, font: fonts.bold, size: 9, lineHeight: 11, color: PDF_COLORS.ink });
    const propertyName = drawPdfWrappedText(page, property?.name || "Property", { x: left + 266, y: infoY, width: 240, font: fonts.bold, size: 9, lineHeight: 11, color: PDF_COLORS.ink });
    let blockY = Math.min(ownerName.nextY, propertyName.nextY) - 3;
    const ownerDetails = [owner.email, owner.phone].filter(Boolean).map((value) => sanitizePdfText(value));
    const propertyDetails = [property?.address].filter(Boolean).map((value) => sanitizePdfText(value));
    for (const value of ownerDetails) {
      const row = drawPdfWrappedText(page, value, { x: left, y: blockY, width: 242, font: fonts.regular, size: 7.5, lineHeight: 9, color: PDF_COLORS.muted });
      blockY = row.nextY - 2;
    }
    let propertyY = Math.min(ownerName.nextY, propertyName.nextY) - 3;
    for (const value of propertyDetails) {
      const row = drawPdfWrappedText(page, value, { x: left + 266, y: propertyY, width: 240, font: fonts.regular, size: 7.5, lineHeight: 9, color: PDF_COLORS.muted });
      propertyY = row.nextY - 2;
    }
    const detailBottom = Math.min(blockY, propertyY);
    const tableY = detailBottom - 15;
    page.drawLine({ start: { x: left, y: tableY + 7 }, end: { x: right, y: tableY + 7 }, thickness: 0.6, color: PDF_COLORS.line });
    return drawPdfTableHeader(page, left, tableY - 7, tableColumns, fonts.bold);
  };

  let { page, top, bottom } = await addPage(pdfDoc, logoBytes, logo);
  let y = await drawHeader(page, top, false);
  const items = invoice.items?.length ? invoice.items : [{ description: invoice.description || "Property Management Fee", qty: 1, rate: invoice.amount }];
  let rowIndex = 0;
  for (const item of items) {
    const quantity = Number(item.qty) || 0;
    const unitRate = Number(item.rate) || 0;
    const values = [sanitizePdfText(item.description, "Service"), String(quantity), formatPdfMoney(unitRate), formatPdfMoney(quantity * unitRate)];
    const rowHeight = measurePdfTableRow(values, tableColumns, fonts.regular, 8);
    if (y - rowHeight < bottom + 15) {
      ({ page, top, bottom } = await addPage(pdfDoc, logoBytes, logo));
      y = await drawHeader(page, top, true);
    }
    y = drawPdfTableRow(page, left, y, values, tableColumns, fonts.regular, rowIndex++);
  }

  if (y < bottom + 155) {
    ({ page, top, bottom } = await addPage(pdfDoc, logoBytes, logo));
    y = await drawHeader(page, top, true);
  }
  y -= 18;
  const summaryWidth = 232;
  const summaryX = right - summaryWidth;
  page.drawRectangle({ x: summaryX, y: y - 112, width: summaryWidth, height: 118, color: PDF_COLORS.surface });
  page.drawLine({ start: { x: summaryX, y: y + 2 }, end: { x: right, y: y + 2 }, thickness: 0.7, color: PDF_COLORS.line });
  let summaryY = y - 14;
  const summaryRow = (label: string, amount: number, emphasize = false) => {
    page.drawText(label, { x: summaryX + 12, y: summaryY, size: emphasize ? 9 : 8, font: emphasize ? fonts.bold : fonts.regular, color: emphasize ? PDF_COLORS.navy : PDF_COLORS.muted });
    const text = formatPdfMoney(amount);
    page.drawText(text, { x: right - 12 - fonts.regular.widthOfTextAtSize(text, 8), y: summaryY, size: emphasize ? 9 : 8, font: emphasize ? fonts.bold : fonts.regular, color: emphasize ? PDF_COLORS.navy : PDF_COLORS.ink });
    summaryY -= emphasize ? 19 : 15;
  };
  summaryRow("Subtotal", calculation.subtotal);
  summaryRow("Discount", calculation.discount);
  summaryRow("Tax", calculation.tax);
  summaryRow("Invoice total", calculation.total, true);
  summaryRow("Amount paid", calculation.amountPaid);
  summaryRow("Balance due", calculation.balanceDue, true);

  await finalizePdfDocument(pdfDoc, fonts, { title: `Management Invoice ${displayInvoiceId}`, reference: invoiceNumber, contact: owner.email || owner.phone || undefined });
  return { pdfBytes: await pdfDoc.save(), invoiceNumber, calculation };
}

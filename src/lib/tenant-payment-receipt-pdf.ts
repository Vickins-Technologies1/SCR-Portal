import "server-only";

import { PDFDocument } from "pdf-lib";
import {
  A4_PAGE_SIZE,
  applyPdfTemplate,
  drawPdfSectionHeading,
  drawPdfTableHeader,
  drawPdfTableRow,
  drawPdfWrappedText,
  embedPdfFonts,
  embedTemplateImage,
  finalizePdfDocument,
  formatPdfDate,
  formatPdfMoney,
  PDF_COLORS,
  PDF_TEMPLATE_SAFE_AREA,
  type PdfTableColumn,
  wrapPdfText,
  sanitizePdfText,
} from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type TenantPaymentReceiptInput = {
  payment: { receiptNumber: string; amount: number; propertyId: string; paymentDate: string | Date; transactionId?: string; status: string; type?: string; phoneNumber?: string; reference?: string; mpesaCode?: string; method?: string; remainingBalance?: number };
  tenant: { name?: string; email?: string; phone?: string; unit?: string; houseNumber?: string };
  property: { name?: string; address?: string };
};

const allocationColumns: PdfTableColumn[] = [
  { label: "Payment allocation", width: 300 },
  { label: "Amount received", width: 207, align: "right" },
];

export async function generateTenantPaymentReceiptPdf(input: TenantPaymentReceiptInput) {
  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf);
  const logoBytes = getPdfTemplateBytes();
  const logo = await embedTemplateImage(pdf, logoBytes);
  const left = PDF_TEMPLATE_SAFE_AREA.left;
  const right = A4_PAGE_SIZE[0] - PDF_TEMPLATE_SAFE_AREA.right;
  const width = right - left;
  let page = pdf.addPage(A4_PAGE_SIZE);
  let area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
  let y = area.contentTopY - 8;

  const drawReceiptHeading = (continued = false) => {
    page.drawText(continued ? "PAYMENT RECEIPT - CONTINUED" : "PAYMENT RECEIPT", { x: left, y, size: continued ? 13 : 18, font: fonts.bold, color: PDF_COLORS.navy });
    page.drawText(continued ? `Receipt ${input.payment.receiptNumber}` : `Receipt no. ${input.payment.receiptNumber}`, { x: left, y: y - 18, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
    if (!continued) {
      const label = "VERIFIED PAYMENT";
      const badgeWidth = fonts.bold.widthOfTextAtSize(label, 7) + 14;
      page.drawRectangle({ x: right - badgeWidth, y: y - 5, width: badgeWidth, height: 15, color: PDF_COLORS.green });
      page.drawText(label, { x: right - badgeWidth + 7, y: y, size: 7, font: fonts.bold, color: PDF_COLORS.white });
    }
    y -= continued ? 38 : 32;
  };

  const newPage = async () => {
    page = pdf.addPage(A4_PAGE_SIZE);
    area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
    y = area.contentTopY - 8;
    drawReceiptHeading(true);
  };
  drawReceiptHeading();
  y = drawPdfSectionHeading(page, "Payment overview", left, y, width, fonts.bold);
  page.drawRectangle({ x: left, y: y - 47, width, height: 54, color: PDF_COLORS.surface });
  page.drawText("AMOUNT RECEIVED", { x: left + 14, y: y - 15, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
  page.drawText(formatPdfMoney(input.payment.amount), { x: left + 14, y: y - 37, size: 17, font: fonts.bold, color: PDF_COLORS.navy });
  page.drawText("PAYMENT DATE", { x: right - 155, y: y - 15, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
  page.drawText(formatPdfDate(input.payment.paymentDate), { x: right - 155, y: y - 33, size: 9, font: fonts.bold, color: PDF_COLORS.ink });
  y -= 69;

  y = drawPdfSectionHeading(page, "Tenant and property", left, y, width, fonts.bold);
  const tenantInfo = [
    ["Tenant", input.tenant.name || "Unknown"],
    ["Email", input.tenant.email || "-"],
    ["Phone", input.tenant.phone || "-"],
    ["Unit", input.tenant.houseNumber || input.tenant.unit || "-"],
  ] as const;
  const propertyInfo = [["Property", input.property.name || "-"], ["Address", input.property.address || "-"]] as const;
  const columnHeight = (rows: ReadonlyArray<readonly [string, string]>, colWidth: number) => rows.reduce((height, [, value]) => height + 17 + wrapPdfText(value, fonts.regular, 8, colWidth).length * 10, 0);
  const infoHeight = Math.max(columnHeight(tenantInfo, 242), columnHeight(propertyInfo, 240));
  if (y - infoHeight < area.contentBottomY + 16) {
    await newPage();
    y = drawPdfSectionHeading(page, "Tenant and property", left, area.contentTopY - 10, width, fonts.bold);
  }
  const drawInfoColumn = async (rows: ReadonlyArray<readonly [string, string]>, x: number, colWidth: number) => {
    let colY = y;
    for (const [label, value] of rows) {
      page.drawText(label.toUpperCase(), { x, y: colY, size: 6.5, font: fonts.bold, color: PDF_COLORS.muted });
      colY -= 10;
      const result = drawPdfWrappedText(page, value, { x, y: colY, width: colWidth, font: fonts.regular, size: 8, lineHeight: 10, color: PDF_COLORS.ink });
      colY = result.nextY - 7;
    }
    return colY;
  };
  const tenantBottom = await drawInfoColumn(tenantInfo, left, 242);
  const propertyBottom = await drawInfoColumn(propertyInfo, left + 266, 240);
  y = Math.min(tenantBottom, propertyBottom) - 6;

  if (y < area.contentBottomY + 55) { await newPage(); y = area.contentTopY - 10; }
  y = drawPdfSectionHeading(page, "Payment details", left, y, width, fonts.bold);
  const paymentRows = [
    ["Payment type", input.payment.type || "Other"],
    ["Payment method", input.payment.method || "Recorded payment"],
    ["Transaction ID", input.payment.transactionId || input.payment.receiptNumber],
    ["M-Pesa reference", input.payment.mpesaCode || input.payment.reference || "-"],
    ["Payer phone", input.payment.phoneNumber || input.tenant.phone || "-"],
  ] as const;
  for (const [label, value] of paymentRows) {
    if (y < area.contentBottomY + 16) { await newPage(); y = area.contentTopY - 10; }
    page.drawText(label, { x: left, y, size: 7.5, font: fonts.regular, color: PDF_COLORS.muted });
    const lines = wrapPdfText(value, fonts.regular, 8, 320);
    const first = lines.shift() || "-";
    page.drawText(first, { x: left + 150, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
    y -= 14;
    for (const line of lines) {
      if (y < area.contentBottomY + 14) { await newPage(); y = area.contentTopY - 10; }
      page.drawText(line, { x: left + 150, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
      y -= 11;
    }
  }

  if (y < area.contentBottomY + 45) { await newPage(); y = area.contentTopY - 10; }
  y = drawPdfSectionHeading(page, "Allocation", left, y, width, fonts.bold);
  y = drawPdfTableHeader(page, left, y, allocationColumns, fonts.bold);
  y = drawPdfTableRow(page, left, y, [sanitizePdfText(input.payment.type || "Tenant payment"), formatPdfMoney(input.payment.amount)], allocationColumns, fonts.regular, 0);
  if (input.payment.remainingBalance != null) {
    y -= 17;
    page.drawText("Remaining balance", { x: left, y, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
    page.drawText(formatPdfMoney(input.payment.remainingBalance), { x: right - 150, y, size: 8, font: fonts.bold, color: PDF_COLORS.navy });
  }
  await finalizePdfDocument(pdf, fonts, { title: `Payment Receipt ${input.payment.receiptNumber}`, reference: input.payment.receiptNumber });
  return pdf.save();
}

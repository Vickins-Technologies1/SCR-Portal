import { PDFDocument } from "pdf-lib";
import {
  A4_PAGE_SIZE,
  applyPdfTemplate,
  drawPdfSectionHeading,
  drawPdfTableHeader,
  drawPdfTableRow,
  embedPdfFonts,
  embedTemplateImage,
  finalizePdfDocument,
  formatPdfMoney,
  measurePdfTableRow,
  PDF_COLORS,
  PDF_TEMPLATE_SAFE_AREA,
  type PdfTableColumn,
} from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type AirbnbOwnerStatementInput = {
  periodLabel: string;
  ownerName?: string;
  ownerEmail?: string;
  totalAmount: number;
  rows: Array<{ propertyName: string; period: string; amount: number; status: string; method: string; mpesaCode?: string }>;
};

const statementColumns: PdfTableColumn[] = [
  { label: "Property", width: 105 },
  { label: "Period", width: 72 },
  { label: "Amount", width: 85, align: "right" },
  { label: "Status", width: 65 },
  { label: "Method", width: 65 },
  { label: "M-Pesa / reference", width: 115 },
];

export async function generateAirbnbOwnerStatementPdf(input: AirbnbOwnerStatementInput): Promise<Uint8Array> {
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

  const drawHeader = (continued = false, includeTotal = false) => {
    page.drawText(continued ? "AIRBNB OWNER STATEMENT - CONTINUED" : "AIRBNB OWNER STATEMENT", { x: left, y, size: continued ? 13 : 17, font: fonts.bold, color: PDF_COLORS.navy });
    page.drawText(`Period: ${input.periodLabel}`, { x: left, y: y - 19, size: 8.5, font: fonts.regular, color: PDF_COLORS.muted });
    page.drawText(input.ownerName || "Property Owner", { x: left, y: y - 34, size: 8, font: fonts.bold, color: PDF_COLORS.ink });
    page.drawText(input.ownerEmail || "support@soranapropertymanagers.com", { x: left, y: y - 47, size: 7.5, font: fonts.regular, color: PDF_COLORS.muted });
    y -= 62;
    if (includeTotal) {
      page.drawRectangle({ x: right - 186, y: y - 33, width: 186, height: 42, color: PDF_COLORS.surface });
      page.drawText("TOTAL RECEIVED", { x: right - 174, y: y - 15, size: 6.5, font: fonts.bold, color: PDF_COLORS.muted });
      const total = formatPdfMoney(input.totalAmount);
      page.drawText(total, { x: right - 12 - fonts.bold.widthOfTextAtSize(total, 10), y: y - 29, size: 10, font: fonts.bold, color: PDF_COLORS.navy });
      y -= 54;
    }
    y = drawPdfSectionHeading(page, "Collections", left, y, width, fonts.bold);
    y = drawPdfTableHeader(page, left, y, statementColumns, fonts.bold);
  };
  const newPage = async () => {
    page = pdf.addPage(A4_PAGE_SIZE);
    area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
    y = area.contentTopY - 8;
    drawHeader(true, false);
  };

  drawHeader(false, true);
  if (!input.rows.length) {
    page.drawText("No completed collections were recorded for this period.", { x: left + 7, y: y - 8, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
    y -= 24;
  }
  let index = 0;
  for (const row of input.rows) {
    const values = [row.propertyName || "Airbnb Listing", row.period || "-", formatPdfMoney(row.amount), row.status || "-", row.method || "-", row.mpesaCode || "-"];
    const rowHeight = measurePdfTableRow(values, statementColumns, fonts.regular, 7.5);
    if (y - rowHeight < area.contentBottomY + 18) await newPage();
    y = drawPdfTableRow(page, left, y, values, statementColumns, fonts.regular, index++, 7.5);
  }

  if (y < area.contentBottomY + 54) await newPage();
  y -= 17;
  page.drawRectangle({ x: right - 215, y: y - 29, width: 215, height: 39, color: PDF_COLORS.navy });
  page.drawText("TOTAL RECEIVED", { x: right - 203, y: y - 14, size: 7, font: fonts.bold, color: PDF_COLORS.white });
  const total = formatPdfMoney(input.totalAmount);
  page.drawText(total, { x: right - 12 - fonts.bold.widthOfTextAtSize(total, 10), y: y - 16, size: 10, font: fonts.bold, color: PDF_COLORS.white });

  await finalizePdfDocument(pdf, fonts, { title: `Airbnb Owner Statement - ${input.periodLabel}`, reference: input.periodLabel, contact: input.ownerEmail || undefined });
  return pdf.save();
}

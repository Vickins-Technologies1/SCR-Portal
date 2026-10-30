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
} from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type AirbnbTaxReportPdfInput = {
  start: Date;
  end: Date;
  ownerName?: string;
  summary: { occupancyRate: number; revenue: number; adr: number; revpar: number };
  taxes: { tourismLevy: number; vat: number; dst: number; total: number; rates: { tourismLevy: number; vat: number; dst: number } };
};

const taxColumns: PdfTableColumn[] = [
  { label: "Tax category", width: 255 },
  { label: "Rate", width: 100, align: "right" },
  { label: "Estimated amount", width: 152, align: "right" },
];

export async function generateAirbnbTaxReportPdf(input: AirbnbTaxReportPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf);
  const logoBytes = getPdfTemplateBytes();
  const logo = await embedTemplateImage(pdf, logoBytes);
  const page = pdf.addPage(A4_PAGE_SIZE);
  const { contentTopY } = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
  const left = PDF_TEMPLATE_SAFE_AREA.left;
  const right = A4_PAGE_SIZE[0] - PDF_TEMPLATE_SAFE_AREA.right;
  const width = right - left;
  let y = contentTopY - 9;

  page.drawText("AIRBNB TAX & PERFORMANCE REPORT", { x: left, y, size: 16, font: fonts.bold, color: PDF_COLORS.navy });
  y -= 18;
  page.drawText(`Reporting period: ${formatPdfDate(input.start)} to ${formatPdfDate(input.end)}`, { x: left, y, size: 8.5, font: fonts.regular, color: PDF_COLORS.muted });
  const ownerLine = drawPdfWrappedText(page, `Prepared for: ${input.ownerName || "Property Owner"}`, { x: left, y: y - 14, width, font: fonts.regular, size: 8, lineHeight: 10, color: PDF_COLORS.ink });
  y = ownerLine.nextY - 14;

  y = drawPdfSectionHeading(page, "Performance summary", left, y, width, fonts.bold);
  const metrics: Array<[string, string]> = [
    ["Revenue", formatPdfMoney(input.summary.revenue)],
    ["Occupancy rate", `${input.summary.occupancyRate}%`],
    ["Average daily rate", formatPdfMoney(input.summary.adr)],
    ["Revenue per available night", formatPdfMoney(input.summary.revpar)],
  ];
  const gap = 10;
  const cardWidth = (width - gap) / 2;
  metrics.forEach(([label, value], index) => {
    const x = left + (index % 2) * (cardWidth + gap);
    const cardY = y - Math.floor(index / 2) * 56;
    page.drawRectangle({ x, y: cardY - 40, width: cardWidth, height: 48, color: PDF_COLORS.surface });
    page.drawText(label.toUpperCase(), { x: x + 11, y: cardY - 15, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
    page.drawText(value, { x: x + 11, y: cardY - 32, size: 10, font: fonts.bold, color: PDF_COLORS.navy });
  });
  y -= 128;

  y = drawPdfSectionHeading(page, "Estimated tax breakdown", left, y, width, fonts.bold);
  y = drawPdfTableHeader(page, left, y, taxColumns, fonts.bold);
  const rows: Array<[string, string, string]> = [
    ["Tourism levy", `${(input.taxes.rates.tourismLevy * 100).toFixed(1)}%`, formatPdfMoney(input.taxes.tourismLevy)],
    ["VAT", `${(input.taxes.rates.vat * 100).toFixed(1)}%`, formatPdfMoney(input.taxes.vat)],
    ["Digital service tax", `${(input.taxes.rates.dst * 100).toFixed(1)}%`, formatPdfMoney(input.taxes.dst)],
  ];
  rows.forEach((row, index) => { y = drawPdfTableRow(page, left, y, row, taxColumns, fonts.regular, index, 8); });
  y -= 20;
  page.drawRectangle({ x: right - 255, y: y - 28, width: 255, height: 38, color: PDF_COLORS.navy });
  page.drawText("TOTAL ESTIMATED TAX", { x: right - 243, y: y - 13, size: 7, font: fonts.bold, color: PDF_COLORS.white });
  const totalText = formatPdfMoney(input.taxes.total);
  page.drawText(totalText, { x: right - 12 - fonts.bold.widthOfTextAtSize(totalText, 10), y: y - 15, size: 10, font: fonts.bold, color: PDF_COLORS.white });

  await finalizePdfDocument(pdf, fonts, { title: "Airbnb Tax and Performance Report", reference: `${formatPdfDate(input.start)} - ${formatPdfDate(input.end)}` });
  return pdf.save();
}

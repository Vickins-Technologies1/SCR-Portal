import "server-only";

import { PDFDocument, PDFPage, rgb } from "pdf-lib";
import {
  A4_PAGE_SIZE,
  applyPdfTemplate,
  drawPdfSectionHeading,
  drawPdfTableHeader,
  drawPdfTableRow,
  drawPdfWrappedText,
  drawPdfRightText,
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
  wrapPdfText,
} from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type TenantInvoicePdfInput = {
  invoiceNumber: string; issueDate: Date | string; dueDate: Date | string; billingPeriod?: string; status?: string;
  tenantName: string; tenantEmail?: string; propertyName: string; propertyAddress?: string; unitLabel: string;
  items: Array<{ description: string; quantity: number; unitAmount: number; amount: number }>;
  totalMinor: number; amountPaidMinor?: number; landlordName?: string; landlordEmail?: string; landlordPhone?: string;
  paymentInstructions?: string; brandName?: string; brandColor?: string; previousOutstandingMinor?: number; creditsAndAdjustmentsMinor?: number;
};

const cash = (minor: number) => formatPdfMoney((Number(minor) || 0) / 100);
const invoiceAccent = (color?: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(color || "");
  if (!match) return PDF_COLORS.navy;
  const hex = match[1];
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
};
const itemColumns: PdfTableColumn[] = [
  { label: "Description", width: 239 },
  { label: "Qty", width: 48, align: "right" },
  { label: "Unit price", width: 99, align: "right" },
  { label: "Amount", width: 121, align: "right" },
];

async function addPage(pdf: PDFDocument, logoBytes: Uint8Array, logo: Awaited<ReturnType<typeof embedTemplateImage>>) {
  const page = pdf.addPage(A4_PAGE_SIZE);
  const area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
  return { page, top: area.contentTopY, bottom: area.contentBottomY };
}

function drawMeta(page: PDFPage, fonts: PdfFonts, label: string, value: string, x: number, y: number, right: number, valueColor = PDF_COLORS.ink) {
  page.drawText(label, { x, y, size: 6.5, font: fonts.regular, color: PDF_COLORS.muted });
  drawPdfRightText(page, sanitizePdfText(value), right, y, 7.5, fonts.bold, valueColor);
}

export async function generateTenantInvoicePdf(input: TenantInvoicePdfInput) {
  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf);
  const logoBytes = getPdfTemplateBytes();
  const logo = await embedTemplateImage(pdf, logoBytes);
  const left = PDF_TEMPLATE_SAFE_AREA.left;
  const right = A4_PAGE_SIZE[0] - PDF_TEMPLATE_SAFE_AREA.right;
  const width = right - left;
  const accent = invoiceAccent(input.brandColor);
  const amountPaid = input.amountPaidMinor || 0;
  const adjustments = input.creditsAndAdjustmentsMinor || 0;
  const previous = input.previousOutstandingMinor || 0;
  const currentBalanceMinor = Math.max(0, input.totalMinor - amountPaid + adjustments);
  const invoiceStatus = sanitizePdfText(input.status || (currentBalanceMinor <= 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY PAID" : "ISSUED")).toUpperCase();

  const drawHeader = async (page: PDFPage, top: number, continued: boolean) => {
    const title = continued ? "RENT INVOICE - CONTINUED" : "RENT INVOICE";
    page.drawText(title, { x: left, y: top - 8, size: continued ? 14 : 17, font: fonts.bold, color: accent });
    drawMeta(page, fonts, "INVOICE NO.", input.invoiceNumber, right - 190, top - 8, right);
    drawMeta(page, fonts, "STATUS", invoiceStatus, right - 190, top - 23, right, invoiceStatus === "PAID" ? PDF_COLORS.green : PDF_COLORS.navy);
    drawMeta(page, fonts, "ISSUED", formatPdfDate(input.issueDate), right - 190, top - 38, right);
    drawMeta(page, fonts, "DUE DATE", formatPdfDate(input.dueDate), right - 190, top - 53, right);
    page.drawLine({ start: { x: left, y: top - 66 }, end: { x: right, y: top - 66 }, thickness: 0.65, color: PDF_COLORS.line });

    if (!continued) {
      const infoTop = top - 81;
      const col2 = left + 266;
      page.drawText("BILLED TO", { x: left, y: infoTop, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
      page.drawText("PROPERTY & MANAGER", { x: col2, y: infoTop, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
      const tenantName = drawPdfWrappedText(page, input.tenantName, { x: left, y: infoTop - 14, width: 242, font: fonts.bold, size: 9, lineHeight: 11, color: PDF_COLORS.ink });
      const propertyName = drawPdfWrappedText(page, input.propertyName, { x: col2, y: infoTop - 14, width: 240, font: fonts.bold, size: 9, lineHeight: 11, color: PDF_COLORS.ink });
      let tenantY = Math.min(tenantName.nextY, propertyName.nextY) - 2;
      const leftLines = [input.tenantEmail, `${input.unitLabel} · ${input.billingPeriod || "Billing period not specified"}`].filter(Boolean);
      const rightLines = [input.propertyAddress, `${input.landlordName || input.brandName || "Property Manager"}${input.landlordEmail ? ` · ${input.landlordEmail}` : ""}`, input.landlordPhone].filter(Boolean);
      let rightY = tenantY;
      for (const value of leftLines) {
        const result = drawPdfWrappedText(page, value, { x: left, y: tenantY, width: 242, font: fonts.regular, size: 7.5, lineHeight: 9, color: PDF_COLORS.muted });
        tenantY = result.nextY - 2;
      }
      for (const value of rightLines) {
        const result = drawPdfWrappedText(page, value, { x: col2, y: rightY, width: 240, font: fonts.regular, size: 7.5, lineHeight: 9, color: PDF_COLORS.muted });
        rightY = result.nextY - 2;
      }
      const tableStart = Math.min(tenantY, rightY) - 13;
      page.drawLine({ start: { x: left, y: tableStart + 8 }, end: { x: right, y: tableStart + 8 }, thickness: 0.6, color: PDF_COLORS.line });
      return drawPdfTableHeader(page, left, tableStart - 6, itemColumns, fonts.bold);
    }
    return drawPdfTableHeader(page, left, top - 79, itemColumns, fonts.bold);
  };

  let { page, top, bottom } = await addPage(pdf, logoBytes, logo);
  let y = await drawHeader(page, top, false);
  let rowIndex = 0;
  for (const item of input.items) {
    const values = [
      sanitizePdfText(item.description),
      String(Number(item.quantity) || 0),
      cash(item.unitAmount),
      cash(item.amount),
    ];
    const rowHeight = measurePdfTableRow(values, itemColumns, fonts.regular, 8);
    if (y - rowHeight < bottom + 16) {
      ({ page, top, bottom } = await addPage(pdf, logoBytes, logo));
      y = await drawHeader(page, top, true);
    }
    y = drawPdfTableRow(page, left, y, values, itemColumns, fonts.regular, rowIndex++);
  }

  if (y < bottom + 154) {
    ({ page, top, bottom } = await addPage(pdf, logoBytes, logo));
    y = await drawHeader(page, top, true);
  }
  y -= 18;
  const summaryWidth = 256;
  const summaryX = right - summaryWidth;
  const summaryRows: Array<[string, number, boolean]> = [
    ["Invoice total", input.totalMinor, true],
    ...(previous > 0 ? [["Previous outstanding", previous, false] as [string, number, boolean]] : []),
    ...(adjustments !== 0 ? [["Credits / adjustments", adjustments, false] as [string, number, boolean]] : []),
    ["Amount paid", amountPaid, false],
    ["Current balance due", currentBalanceMinor, true],
    ...(previous > 0 ? [["Total due including prior balance", currentBalanceMinor + previous, true] as [string, number, boolean]] : []),
  ];
  const summaryHeight = summaryRows.reduce((height, [, , strong]) => height + (strong ? 18 : 15), 14);
  page.drawRectangle({ x: summaryX, y: y - summaryHeight + 4, width: summaryWidth, height: summaryHeight + 8, color: PDF_COLORS.surface });
  page.drawLine({ start: { x: summaryX, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.7, color: PDF_COLORS.line });
  let summaryY = y - 11;
  summaryRows.forEach(([label, value, strong]) => {
    const color = strong ? PDF_COLORS.navy : PDF_COLORS.muted;
    const size = strong ? 8.5 : 7.5;
    page.drawText(label, { x: summaryX + 10, y: summaryY, size, font: strong ? fonts.bold : fonts.regular, color });
    drawPdfRightText(page, cash(value), right - 10, summaryY, size, strong ? fonts.bold : fonts.regular, strong ? PDF_COLORS.navy : PDF_COLORS.ink);
    summaryY -= strong ? 18 : 15;
  });
  y = y - summaryHeight - 13;

  if (input.paymentInstructions?.trim()) {
    if (y < bottom + 64) {
      ({ page, top, bottom } = await addPage(pdf, logoBytes, logo));
      y = top - 10;
    }
    y = drawPdfSectionHeading(page, "Payment instructions", left, y, width, fonts.bold);
    const instructions = input.paymentInstructions.split(/\r?\n/).map((line) => sanitizePdfText(line)).filter(Boolean);
    const instructionLines = instructions.flatMap((line) => wrapPdfText(line, fonts.regular, 8, width - 8));
    for (const line of instructionLines) {
      if (y - 11 < bottom + 14) {
        ({ page, top, bottom } = await addPage(pdf, logoBytes, logo));
        y = drawPdfSectionHeading(page, "Payment instructions - continued", left, top - 10, width, fonts.bold);
      }
      page.drawText(line, { x: left, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
      y -= 11;
    }
  }

  await finalizePdfDocument(pdf, fonts, { title: `Rent Invoice ${input.invoiceNumber}`, reference: input.invoiceNumber, contact: input.landlordEmail || undefined });
  return { pdfBytes: await pdf.save(), invoiceNumber: input.invoiceNumber };
}

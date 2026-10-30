import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { A4_PAGE_SIZE, applyPdfTemplate } from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type TenantInvoicePdfInput = {
  invoiceNumber: string; issueDate: Date | string; dueDate: Date | string; billingPeriod?: string;
  tenantName: string; tenantEmail?: string; propertyName: string; propertyAddress?: string; unitLabel: string;
  items: Array<{ description: string; quantity: number; unitAmount: number; amount: number }>;
  totalMinor: number; amountPaidMinor?: number; landlordName?: string; landlordEmail?: string; landlordPhone?: string;
  paymentInstructions?: string; brandName?: string; brandColor?: string; previousOutstandingMinor?: number; creditsAndAdjustmentsMinor?: number;
};

const navy = rgb(0.04, 0.17, 0.31);
const gray = rgb(0.36, 0.42, 0.49);
const line = rgb(0.86, 0.89, 0.92);
const cash = (minor: number) => `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (v: Date | string) => new Date(v).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", year: "numeric", month: "short", day: "2-digit" });
const clean = (v: unknown, fallback = "—") => String(v ?? "").replace(/[\r\n\t]/g, " ").trim() || fallback;

function invoiceNavy(color?: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color || "");
  if (!match) return navy;
  const hex = match[1];
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

export async function generateTenantInvoicePdf(input: TenantInvoicePdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = invoiceNavy(input.brandColor);
  let page = pdf.addPage(A4_PAGE_SIZE);
  let y = await addHeader(page, pdf, regular, bold, input, accent);
  const left = 50;
  const right = A4_PAGE_SIZE[0] - 50;
  for (const item of input.items) {
    if (y < 160) { page = pdf.addPage(A4_PAGE_SIZE); y = await addHeader(page, pdf, regular, bold, input, accent); }
    page.drawText(clean(item.description).slice(0, 58), { x: left, y, size: 9, font: regular, color: navy });
    page.drawText(String(item.quantity), { x: 355, y, size: 9, font: regular, color: gray });
    page.drawText(cash(item.unitAmount), { x: 400, y, size: 9, font: regular, color: gray });
    drawRight(page, cash(item.amount), right, y, 9, regular, navy);
    y -= 22;
  }
  if (y < 220) { page = pdf.addPage(A4_PAGE_SIZE); y = await addHeader(page, pdf, regular, bold, input, accent); }
  y -= 9;
  page.drawLine({ start: { x: 330, y }, end: { x: right, y }, thickness: 0.8, color: line });
  y -= 22;
  drawRight(page, `Invoice total  ${cash(input.totalMinor)}`, right, y, 11, bold, navy); y -= 20;
  if ((input.previousOutstandingMinor || 0) > 0) { drawRight(page, `Previous outstanding  ${cash(input.previousOutstandingMinor || 0)}`, right, y, 9, regular, gray); y -= 18; }
  if ((input.creditsAndAdjustmentsMinor || 0) !== 0) { drawRight(page, `Credits / adjustments  ${cash(input.creditsAndAdjustmentsMinor || 0)}`, right, y, 9, regular, gray); y -= 18; }
  drawRight(page, `Amount paid  ${cash(input.amountPaidMinor || 0)}`, right, y, 9, regular, gray); y -= 20;
  const currentBalanceMinor = Math.max(0, input.totalMinor - (input.amountPaidMinor || 0) + (input.creditsAndAdjustmentsMinor || 0));
  drawRight(page, `Current balance due  ${cash(currentBalanceMinor)}`, right, y, 11, bold, navy); y -= 20;
  if ((input.previousOutstandingMinor || 0) > 0) { drawRight(page, `Total due including prior balance  ${cash(currentBalanceMinor + (input.previousOutstandingMinor || 0))}`, right, y, 10, bold, navy); y -= 25; }
  if (input.paymentInstructions) {
    page.drawText("PAYMENT INSTRUCTIONS", { x: left, y, size: 8, font: bold, color: navy }); y -= 14;
    for (const row of input.paymentInstructions.split("\n").slice(0, 5)) {
      page.drawText(clean(row).slice(0, 90), { x: left, y, size: 8, font: regular, color: gray }); y -= 12;
    }
  }
  return { pdfBytes: await pdf.save(), invoiceNumber: input.invoiceNumber };
}

async function addHeader(page: ReturnType<PDFDocument["addPage"]>, pdf: PDFDocument, regular: any, bold: any, input: TenantInvoicePdfInput, accent: ReturnType<typeof rgb>) {
  const { safeArea } = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: getPdfTemplateBytes() });
  const left = safeArea.left, right = A4_PAGE_SIZE[0] - safeArea.right;
  let y = A4_PAGE_SIZE[1] - safeArea.top - 4;
  page.drawText(clean(input.brandName, "My Accurate Rent").slice(0, 36), { x: left, y, size: 11, font: bold, color: accent });
  drawRight(page, input.invoiceNumber, right, y, 10, bold, navy); y -= 20;
  page.drawText("RENT INVOICE", { x: left, y, size: 16, font: bold, color: navy }); y -= 22;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: line }); y -= 18;
  page.drawText(`Tenant: ${clean(input.tenantName)}`, { x: left, y, size: 9, font: bold, color: navy });
  page.drawText(`Property: ${clean(input.propertyName)}`, { x: left, y: y - 15, size: 9, font: regular, color: navy });
  page.drawText(`Unit: ${clean(input.unitLabel)}`, { x: left, y: y - 30, size: 9, font: regular, color: gray });
  page.drawText(`Billing period: ${clean(input.billingPeriod)}`, { x: 300, y, size: 9, font: regular, color: gray });
  page.drawText(`Issued: ${dateText(input.issueDate)}`, { x: 300, y: y - 15, size: 9, font: regular, color: gray });
  page.drawText(`Due: ${dateText(input.dueDate)}`, { x: 300, y: y - 30, size: 9, font: regular, color: gray });
  page.drawText(`Address: ${clean(input.propertyAddress)}`, { x: left, y: y - 45, size: 8, font: regular, color: gray });
  page.drawText(`Managed by: ${clean(input.landlordName, "Property Manager")}`, { x: 300, y: y - 45, size: 8, font: bold, color: navy });
  page.drawText(clean([input.landlordEmail, input.landlordPhone].filter(Boolean).join(" · ")), { x: 300, y: y - 58, size: 7, font: regular, color: gray });
  y -= 76;
  page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 18, color: navy });
  page.drawText("DESCRIPTION", { x: left + 7, y, size: 7, font: bold, color: rgb(1, 1, 1) });
  page.drawText("QTY", { x: 355, y, size: 7, font: bold, color: rgb(1, 1, 1) });
  page.drawText("UNIT", { x: 400, y, size: 7, font: bold, color: rgb(1, 1, 1) });
  drawRight(page, "AMOUNT", right - 7, y, 7, bold, rgb(1, 1, 1));
  return y - 23;
}

function drawRight(page: any, text: string, right: number, y: number, size: number, font: any, color: any) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

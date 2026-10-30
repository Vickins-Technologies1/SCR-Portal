import "server-only";

import { PDFDocument } from "pdf-lib";
import {
  A4_PAGE_SIZE,
  applyPdfTemplate,
  drawPdfSectionHeading,
  embedPdfFonts,
  embedTemplateImage,
  finalizePdfDocument,
  formatPdfDate,
  formatPdfMoney,
  PDF_COLORS,
  PDF_TEMPLATE_SAFE_AREA,
  wrapPdfText,
} from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type AirbnbBookingReceiptInput = {
  reference: string;
  propertyName: string;
  guestName: string;
  guestPhone?: string;
  checkIn?: Date | string | null;
  checkOut?: Date | string | null;
  nights: number;
  bookingAmount: number;
  verifiedAmount: number;
  paymentMethod: string;
  paymentReference?: string;
  hostName?: string;
  hostPhone?: string;
  hostEmail?: string;
  paymentDate?: Date | string | null;
  bookingStatus: string;
  payoutStatus?: string;
};

export async function generateAirbnbBookingReceiptPdf(input: AirbnbBookingReceiptInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf);
  const logoBytes = getPdfTemplateBytes();
  const logo = await embedTemplateImage(pdf, logoBytes);
  const left = PDF_TEMPLATE_SAFE_AREA.left;
  const right = A4_PAGE_SIZE[0] - PDF_TEMPLATE_SAFE_AREA.right;
  const width = right - left;
  const isVerified = input.verifiedAmount > 0;
  let page = pdf.addPage(A4_PAGE_SIZE);
  let area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
  let y = area.contentTopY - 8;
  const drawHeading = (continued = false) => {
    page.drawText(continued ? "BOOKING RECEIPT - CONTINUED" : "BOOKING PAYMENT RECEIPT", { x: left, y, size: continued ? 13 : 17, font: fonts.bold, color: PDF_COLORS.navy });
    page.drawText(`Booking reference: ${input.reference}`, { x: left, y: y - 19, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
    if (!continued) {
      const statusText = isVerified ? "PAYMENT VERIFIED" : "PAYMENT PENDING VERIFICATION";
      const badgeColor = isVerified ? PDF_COLORS.green : PDF_COLORS.amber;
      const badgeWidth = fonts.bold.widthOfTextAtSize(statusText, 6.5) + 14;
      page.drawRectangle({ x: right - badgeWidth, y: y - 5, width: badgeWidth, height: 15, color: badgeColor });
      page.drawText(statusText, { x: right - badgeWidth + 7, y, size: 6.5, font: fonts.bold, color: PDF_COLORS.white });
    }
    y -= continued ? 38 : 32;
  };
  const newPage = async () => {
    page = pdf.addPage(A4_PAGE_SIZE);
    area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: logoBytes, backgroundImage: logo });
    y = area.contentTopY - 8;
    drawHeading(true);
  };
  const writeLines = async (value: unknown, x: number, maxWidth: number, size = 8, bold = false) => {
    const font = bold ? fonts.bold : fonts.regular;
    const lines = wrapPdfText(value, font, size, maxWidth);
    for (const line of lines) {
      if (y < area.contentBottomY + size + 6) await newPage();
      page.drawText(line, { x, y, size, font, color: bold ? PDF_COLORS.ink : PDF_COLORS.muted });
      y -= size + 4;
    }
  };

  drawHeading();
  y = drawPdfSectionHeading(page, "Payment summary", left, y, width, fonts.bold);
  page.drawRectangle({ x: left, y: y - 52, width, height: 60, color: PDF_COLORS.surface });
  page.drawText("VERIFIED AMOUNT RECEIVED", { x: left + 14, y: y - 17, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
  page.drawText(formatPdfMoney(input.verifiedAmount), { x: left + 14, y: y - 41, size: 17, font: fonts.bold, color: isVerified ? PDF_COLORS.green : PDF_COLORS.navy });
  page.drawText("BOOKING AMOUNT", { x: right - 160, y: y - 17, size: 7, font: fonts.bold, color: PDF_COLORS.muted });
  page.drawText(formatPdfMoney(input.bookingAmount), { x: right - 160, y: y - 36, size: 9, font: fonts.bold, color: PDF_COLORS.ink });
  y -= 76;

  y = drawPdfSectionHeading(page, "Guest and stay", left, y, width, fonts.bold);
  const stayRows = [
    ["Property", input.propertyName],
    ["Guest", input.guestName],
    ["Guest contact", input.guestPhone || "-"],
    ["Check-in", formatPdfDate(input.checkIn, { weekday: "short" })],
    ["Check-out", formatPdfDate(input.checkOut, { weekday: "short" })],
    ["Nights", String(input.nights || 0)],
    ["Booking status", input.bookingStatus || "-"],
  ] as const;
  for (const [label, value] of stayRows) {
    const lines = wrapPdfText(value, fonts.regular, 8, width - 170);
    for (let index = 0; index < lines.length; index++) {
      if (y < area.contentBottomY + 16) { await newPage(); y = drawPdfSectionHeading(page, "Guest and stay - continued", left, area.contentTopY - 10, width, fonts.bold); }
      if (index === 0) page.drawText(label, { x: left, y, size: 7.5, font: fonts.regular, color: PDF_COLORS.muted });
      page.drawText(lines[index], { x: left + 165, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
      y -= 14;
    }
  }

  if (y < area.contentBottomY + 75) { await newPage(); y = area.contentTopY - 10; }
  y = drawPdfSectionHeading(page, "Payment details", left, y, width, fonts.bold);
  const paymentRows = [
    ["Verification", isVerified ? "Verified against a completed payment" : "No completed payment is recorded"],
    ["Payment method", input.paymentMethod || "-"],
    ["Payment reference", input.paymentReference || "-"],
    ["Payment date", input.paymentDate ? formatPdfDate(input.paymentDate, { hour: "2-digit", minute: "2-digit" }) : "Pending"],
    ["Host", input.hostName || "Host"],
    ["Host contact", [input.hostPhone, input.hostEmail].filter(Boolean).join(" | ") || "-"],
    ["Payout status", input.payoutStatus || "-"],
  ] as const;
  for (const [label, value] of paymentRows) {
    const lines = wrapPdfText(value, fonts.regular, 8, width - 170);
    for (let index = 0; index < lines.length; index++) {
      if (y < area.contentBottomY + 16) { await newPage(); y = drawPdfSectionHeading(page, "Payment details - continued", left, area.contentTopY - 10, width, fonts.bold); }
      if (index === 0) page.drawText(label, { x: left, y, size: 7.5, font: fonts.regular, color: PDF_COLORS.muted });
      page.drawText(lines[index], { x: left + 165, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
      y -= 14;
    }
  }

  await writeLines("This receipt confirms the amount received from completed payment records. Unverified booking amounts are shown separately.", left, width, 7);
  await finalizePdfDocument(pdf, fonts, { title: `Booking Payment Receipt ${input.reference}`, reference: input.reference, contact: input.hostEmail || undefined });
  return pdf.save();
}

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
  formatPdfDate,
  formatPdfMoney,
  measurePdfTableRow,
  PDF_COLORS,
  PDF_TEMPLATE_SAFE_AREA,
  type PdfTableColumn,
  wrapPdfText,
} from "@/lib/pdf-template";

export type TenantPaymentReportInput = {
  report: {
    generatedAt: string; paymentStatusLabel: string; overdueBalance: number; totalPaid: number; collectionRate: number;
    walletBalance: number; leaseRange: string; insights: string[];
    statements: Array<{ _id?: string; amount: number; paymentDate: string; status: string; type?: string; reference?: string; transactionId?: string; mpesaCode?: string }>;
  };
  tenant: { name: string };
  property: { name?: string } | null;
  unitNumbers: string;
  logoBytes: Uint8Array;
};

const statementColumns: PdfTableColumn[] = [
  { label: "Date", width: 82 },
  { label: "Category", width: 72 },
  { label: "Amount", width: 98, align: "right" },
  { label: "Status", width: 92 },
  { label: "Reference", width: 163 },
];

export async function generateTenantPaymentReportPdf(input: TenantPaymentReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf);
  const logo = await embedTemplateImage(pdf, input.logoBytes);
  const left = PDF_TEMPLATE_SAFE_AREA.left;
  const right = A4_PAGE_SIZE[0] - PDF_TEMPLATE_SAFE_AREA.right;
  const width = right - left;
  let page = pdf.addPage(A4_PAGE_SIZE);
  let area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: input.logoBytes, backgroundImage: logo });
  let y = area.contentTopY - 8;
  const drawPageTitle = (continued = false) => {
    page.drawText(continued ? "TENANT PAYMENT REPORT - CONTINUED" : "TENANT PAYMENT REPORT", { x: left, y, size: continued ? 13 : 17, font: fonts.bold, color: PDF_COLORS.navy });
    page.drawText(`Generated: ${input.report.generatedAt}`, { x: left, y: y - 19, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
    if (continued) page.drawText(input.tenant.name, { x: left, y: y - 33, size: 8, font: fonts.bold, color: PDF_COLORS.ink });
    y -= continued ? 49 : 33;
  };
  const newPage = async () => {
    page = pdf.addPage(A4_PAGE_SIZE);
    area = await applyPdfTemplate({ pdfDoc: pdf, page, backgroundBytes: input.logoBytes, backgroundImage: logo });
    y = area.contentTopY - 8;
    drawPageTitle(true);
  };

  drawPageTitle();
  y = drawPdfSectionHeading(page, "Tenant and tenancy", left, y, width, fonts.bold);
  const tenantRows = [
    ["Tenant", input.tenant.name],
    ["Property", input.property?.name || "-"],
    ["Units", input.unitNumbers || "-"],
    ["Lease", input.report.leaseRange || "-"],
    ["Payment status", input.report.paymentStatusLabel || "-"],
  ] as const;
  for (const [label, value] of tenantRows) {
    const lines = wrapPdfText(value, fonts.regular, 8, width - 170);
    for (let index = 0; index < lines.length; index++) {
      if (y < area.contentBottomY + 16) { await newPage(); y = drawPdfSectionHeading(page, "Tenant and tenancy - continued", left, y, width, fonts.bold); }
      if (index === 0) page.drawText(label, { x: left, y, size: 7.5, font: fonts.regular, color: PDF_COLORS.muted });
      page.drawText(lines[index], { x: left + 160, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
      y -= 14;
    }
  }

  if (y < area.contentBottomY + 100) await newPage();
  y = drawPdfSectionHeading(page, "Financial summary", left, y, width, fonts.bold);
  const metrics: Array<[string, string]> = [
    ["Overdue balance", formatPdfMoney(input.report.overdueBalance)],
    ["Total paid", formatPdfMoney(input.report.totalPaid)],
    ["Rent collection rate", `${input.report.collectionRate}%`],
    ["Wallet balance", formatPdfMoney(input.report.walletBalance)],
  ];
  const cardGap = 10;
  const cardWidth = (width - cardGap) / 2;
  metrics.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = left + col * (cardWidth + cardGap);
    const cardY = y - row * 51;
    page.drawRectangle({ x, y: cardY - 34, width: cardWidth, height: 42, color: PDF_COLORS.surface });
    page.drawText(label.toUpperCase(), { x: x + 10, y: cardY - 9, size: 6.5, font: fonts.bold, color: PDF_COLORS.muted });
    page.drawText(value, { x: x + 10, y: cardY - 25, size: 9, font: fonts.bold, color: PDF_COLORS.navy });
  });
  y -= 106;

  if (input.report.insights.length) {
    if (y < area.contentBottomY + 44) await newPage();
    y = drawPdfSectionHeading(page, "Insights", left, y, width, fonts.bold);
    for (const insight of input.report.insights) {
      const lines = wrapPdfText(`- ${insight}`, fonts.regular, 8, width - 8);
      for (const line of lines) {
        if (y < area.contentBottomY + 14) { await newPage(); y = drawPdfSectionHeading(page, "Insights - continued", left, y, width, fonts.bold); }
        page.drawText(line, { x: left + 4, y, size: 8, font: fonts.regular, color: PDF_COLORS.ink });
        y -= 11;
      }
    }
  }

  if (y < area.contentBottomY + 54) await newPage();
  y = drawPdfSectionHeading(page, "Payment statements", left, y, width, fonts.bold);
  y = drawPdfTableHeader(page, left, y, statementColumns, fonts.bold);
  if (!input.report.statements.length) {
    page.drawText("No payments recorded.", { x: left + 7, y: y - 8, size: 8, font: fonts.regular, color: PDF_COLORS.muted });
    y -= 25;
  } else {
    let rowIndex = 0;
    for (const statement of input.report.statements) {
      const reference = statement.reference || statement.mpesaCode || statement.transactionId || statement._id || "-";
      const values = [
        formatPdfDate(statement.paymentDate),
        statement.type || "Other",
        formatPdfMoney(statement.amount),
        statement.status || "-",
        reference,
      ];
      const rowHeight = measurePdfTableRow(values, statementColumns, fonts.regular, 7.5);
      if (y - rowHeight < area.contentBottomY + 12) {
        await newPage();
        y = drawPdfSectionHeading(page, "Payment statements - continued", left, y, width, fonts.bold);
        y = drawPdfTableHeader(page, left, y, statementColumns, fonts.bold);
      }
      y = drawPdfTableRow(page, left, y, values, statementColumns, fonts.regular, rowIndex++, 7.5);
    }
  }

  await finalizePdfDocument(pdf, fonts, { title: `Tenant Payment Report - ${input.tenant.name}` });
  return pdf.save();
}

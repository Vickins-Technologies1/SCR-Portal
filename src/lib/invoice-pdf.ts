import "server-only";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { A4_PAGE_SIZE, applyPdfTemplate } from "@/lib/pdf-template";
import { getPdfTemplateBytes } from "@/lib/pdf-template.server";

export type InvoicePdfOwner = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type InvoicePdfProperty = {
  name?: string | null;
};

export type InvoicePdfInvoice = {
  reference?: string | null;
  amount: number;
  description?: string | null;
  items?: Array<{ description: string; qty: number; rate: number }> | null;
  discount?: number | null;
  tax?: number | null;
};

export async function generateInvoicePdf(params: {
  invoice: InvoicePdfInvoice;
  owner: InvoicePdfOwner;
  property: InvoicePdfProperty | null;
  now?: Date;
  kopokopoTillNumber?: string | null;
}): Promise<{ pdfBytes: Uint8Array; invoiceNumber: string }> {
  const { invoice, owner, property } = params;
  const now = params.now ?? new Date();
  const kopokopoTillNumber = (params.kopokopoTillNumber || "").trim();

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(A4_PAGE_SIZE);
  const { height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const size = 10;
  const line = 15;
  let y = height - 220;

  const { safeArea } = await applyPdfTemplate({
    pdfDoc,
    page,
    backgroundBytes: getPdfTemplateBytes(),
  });

  const rightX = 400;
  const valueX = 480;

  y = height - safeArea.top + 5;
  page.drawText("DATE", { x: rightX, y, size, font: bold, color: rgb(0, 0, 0) });
  page.drawText(now.toLocaleDateString("en-GB"), { x: valueX, y, size, font, color: rgb(0, 0, 0) });

  y -= line;
  page.drawText("INVOICE NO.", { x: rightX, y, size, font: bold, color: rgb(0, 0, 0) });

  const shortInvoiceNo =
    (invoice.reference ? String(invoice.reference).slice(-5) : "") ||
    String(Math.floor(10000 + Math.random() * 90000));

  page.drawText(shortInvoiceNo, { x: valueX, y, size, font, color: rgb(0, 0, 0) });

  y = height - safeArea.top - 120;
  page.drawText("BILL TO", { x: 50, y, size, font: bold });
  y -= line;
  page.drawText(owner?.name || "Property Owner", { x: 50, y, size, font });
  y -= line;
  page.drawText(property?.name || "N/A", { x: 50, y, size, font });
  y -= line;
  page.drawText(owner?.email || "N/A", { x: 50, y, size, font });
  y -= line;
  page.drawText(owner?.phone || "N/A", { x: 50, y, size, font });

  y -= 35;
  const tableY = y;
  const cols = { desc: 50, qty: 310, rate: 400, total: 480 };

  page.drawRectangle({
    x: 50,
    y: y - 5,
    width: 495,
    height: 22,
    color: rgb(0.0039, 0.1647, 0.2902), // #01294a
    opacity: 1,
  });

  const headerY = y + 4;
  page.drawText("DESCRIPTION", { x: cols.desc + 5, y: headerY, size, font: bold, color: rgb(1, 1, 1) });
  page.drawText("QTY", { x: cols.qty + 10, y: headerY, size, font: bold, color: rgb(1, 1, 1) });
  page.drawText("UNIT PRICE", { x: cols.rate + 5, y: headerY, size, font: bold, color: rgb(1, 1, 1) });
  page.drawText("TOTAL", { x: cols.total + 10, y: headerY, size, font: bold, color: rgb(1, 1, 1) });

  y -= 28;

  const items =
    invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0
      ? invoice.items
      : [{ description: invoice.description || "Property Management Fee", qty: 1, rate: invoice.amount }];

  for (const item of items) {
    const total = item.qty * item.rate;
    const desc =
      item.description.length > 42 ? `${item.description.slice(0, 39)}...` : item.description;

    page.drawText(desc, { x: cols.desc + 5, y: y + 2, size, font });
    page.drawText(item.qty.toString(), { x: cols.qty + 15, y: y + 2, size, font });
    page.drawText(`Ksh ${item.rate.toFixed(2)}`, { x: cols.rate + 5, y: y + 2, size, font });
    page.drawText(`Ksh ${total.toFixed(2)}`, { x: cols.total + 5, y: y + 2, size, font });
    y -= line + 3;
  }

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const discount = Number(invoice.discount) || 0;
  const tax = Number(invoice.tax) || 0;
  const balance = subtotal - discount + tax;

  y = tableY - 110;
  const boxX = 350;

  const drawTotal = (label: string, amount: number, isBold = false) => {
    page.drawText(label, { x: boxX, y, size, font: isBold ? bold : font });
    page.drawText(`Ksh ${amount.toFixed(2)}`, { x: 480, y, size, font: isBold ? bold : font });
    y -= line;
  };

  drawTotal("SUBTOTAL", subtotal);
  drawTotal("DISCOUNT", discount);
  drawTotal("TAX RATE", tax);

  page.drawRectangle({
    x: boxX - 10,
    y: y - 10,
    width: 205,
    height: 24,
    color: rgb(0.0039, 0.1647, 0.2902), // #01294a
  });
  page.drawText("BALANCE DUE", { x: boxX, y, size, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Ksh ${balance.toFixed(2)}`, { x: 480, y, size, font: bold, color: rgb(1, 1, 1) });
  y -= line;

  y -= 50;
  page.drawText("Remarks / Payment Instructions:", { x: 50, y, size, font: bold });
  y -= line;
  page.drawText("Make all checks payable to Sorana Property Managers Ltd", { x: 50, y, size, font });
  y -= line;
  if (kopokopoTillNumber) {
    page.drawText(`M-PESA Buy Goods Till: ${kopokopoTillNumber} | Reference: ${shortInvoiceNo}`, { x: 50, y, size, font });
  } else {
    page.drawText(`M-PESA Paybill/Till: (set KOPOKOPO_TILL_NUMBER) | Reference: ${shortInvoiceNo}`, { x: 50, y, size, font });
  }
  y -= line;
  page.drawText("Bank: KCB | A/C: 7726486", { x: 50, y, size, font });

  y -= 35;
  page.drawText("Client Signature ________________________ X", { x: 50, y, size, font });

  page.drawText("Thank you for your business!", {
    x: 50,
    y: safeArea.bottom + 10,
    size: 12,
    font: bold,
    color: rgb(0.0039, 0.1647, 0.2902),
  });

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, invoiceNumber: shortInvoiceNo };
}

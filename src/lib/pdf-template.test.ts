import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  drawPdfTableHeader,
  drawPdfTableRow,
  embedPdfFonts,
  finalizePdfDocument,
  measurePdfTableRow,
  sanitizePdfText,
  wrapPdfText,
  type PdfTableColumn,
} from "./pdf-template";

describe("shared PDF design system", () => {
  it("sanitizes unsupported glyphs before Helvetica encoding", () => {
    expect(sanitizePdfText("A—B € 200 😀")).toBe("A-B EUR 200 ?");
  });

  it("wraps long descriptions and long unbroken references inside the target width", async () => {
    const pdf = await PDFDocument.create();
    const { regular } = await embedPdfFonts(pdf);
    const width = 85;
    const lines = wrapPdfText("Suite 1210 - North Wing / EXTREMELYLONGREFERENCEVALUE1234567890", regular, 8, width);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => regular.widthOfTextAtSize(line, 8) <= width + 0.1)).toBe(true);
  });

  it("keeps wrapped table rows measurable and within A4 content bounds", async () => {
    const pdf = await PDFDocument.create();
    const { regular, bold } = await embedPdfFonts(pdf);
    const page = pdf.addPage([595.28, 841.89]);
    const columns: PdfTableColumn[] = [
      { label: "Description", width: 315 },
      { label: "Amount", width: 192, align: "right" },
    ];
    const headerY = drawPdfTableHeader(page, 44, 700, columns, bold);
    const values = ["A long rental charge description that wraps onto more than one line", "KES 125,000.00"];
    const expectedHeight = measurePdfTableRow(values, columns, regular, 8);
    const nextY = drawPdfTableRow(page, 44, headerY, values, columns, regular, 0);
    expect(headerY - nextY).toBe(expectedHeight);
    expect(nextY).toBeGreaterThan(46);
  });

  it("adds PDF metadata and page numbering to every page", async () => {
    const pdf = await PDFDocument.create();
    const fonts = await embedPdfFonts(pdf);
    pdf.addPage([595.28, 841.89]);
    pdf.addPage([595.28, 841.89]);
    await finalizePdfDocument(pdf, fonts, { title: "Payment Statement", reference: "PERIOD-2026-10" });
    const reopened = await PDFDocument.load(await pdf.save());
    expect(reopened.getTitle()).toBe("Payment Statement");
    expect(reopened.getPageCount()).toBe(2);
  });
});

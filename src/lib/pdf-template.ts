import { PDFDocument, PDFImage, PDFPage, PDFFont, rgb } from "pdf-lib";

export const A4_PAGE_SIZE: [number, number] = [595.28, 841.89];
export const PDF_TEMPLATE_PUBLIC_PATH = "/brand/my-accurate-rent-favicon.png";

export const PDF_COLORS = {
  navy: rgb(0.04, 0.16, 0.32),
  green: rgb(0.05, 0.48, 0.25),
  ink: rgb(0.12, 0.16, 0.21),
  muted: rgb(0.39, 0.44, 0.5),
  line: rgb(0.86, 0.89, 0.92),
  surface: rgb(0.96, 0.97, 0.98),
  white: rgb(1, 1, 1),
  red: rgb(0.67, 0.16, 0.16),
  amber: rgb(0.64, 0.4, 0.06),
} as const;

export const PDF_TEMPLATE_SAFE_AREA = {
  left: 44,
  right: 44,
  top: 112,
  bottom: 46,
} as const;

export type PdfSafeArea = typeof PDF_TEMPLATE_SAFE_AREA;
export type PdfFonts = { regular: PDFFont; bold: PDFFont };
export type PdfTableColumn = { label: string; width: number; align?: "left" | "right"; color?: ReturnType<typeof rgb> };
const fontCache = new WeakMap<PDFDocument, Promise<PdfFonts>>();

const isPng = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

export async function embedTemplateImage(pdfDoc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  return isPng(bytes) ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
}

export async function embedPdfFonts(pdfDoc: PDFDocument): Promise<PdfFonts> {
  let fonts = fontCache.get(pdfDoc);
  if (!fonts) {
    fonts = Promise.all([pdfDoc.embedFont("Helvetica"), pdfDoc.embedFont("Helvetica-Bold")]).then(([regular, bold]) => ({ regular, bold }));
    fontCache.set(pdfDoc, fonts);
  }
  return fonts;
}

export function sanitizePdfText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u20ac/g, "EUR")
    .replace(/[^\x20-\xff]/gu, "?")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

export function formatPdfMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? "-" : ""}KES ${Math.abs(safe).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPdfDate(value: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (value == null || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  });
}

export function wrapPdfText(value: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitizePdfText(value).split(" ");
  const lines: string[] = [];
  let line = "";
  const addLongWord = (word: string) => {
    let piece = "";
    for (const character of word) {
      if (piece && font.widthOfTextAtSize(piece + character, size) > maxWidth) {
        lines.push(piece);
        piece = character;
      } else piece += character;
    }
    return piece;
  };

  for (const sourceWord of words) {
    let word = sourceWord;
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line) { lines.push(line); line = ""; }
      word = addLongWord(word);
      if (word) line = word;
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export function drawPdfWrappedText(
  page: PDFPage,
  value: unknown,
  options: { x: number; y: number; width: number; font: PDFFont; size: number; color?: ReturnType<typeof rgb>; lineHeight?: number },
): { lines: string[]; nextY: number; height: number } {
  const lines = wrapPdfText(value, options.font, options.size, options.width);
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  lines.forEach((line, index) => page.drawText(line, {
    x: options.x,
    y: options.y - index * lineHeight,
    size: options.size,
    font: options.font,
    color: options.color ?? PDF_COLORS.ink,
  }));
  const height = lines.length * lineHeight;
  return { lines, nextY: options.y - height, height };
}

export function drawPdfRightText(page: PDFPage, value: string, right: number, y: number, size: number, font: PDFFont, color = PDF_COLORS.ink): void {
  const text = sanitizePdfText(value);
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

export function drawPdfSectionHeading(page: PDFPage, title: string, x: number, y: number, width: number, font: PDFFont): number {
  page.drawText(sanitizePdfText(title).toUpperCase(), { x, y, size: 9, font, color: PDF_COLORS.navy });
  page.drawLine({ start: { x, y: y - 5 }, end: { x: x + width, y: y - 5 }, thickness: 0.6, color: PDF_COLORS.line });
  return y - 18;
}

export function measurePdfTableRow(values: string[], columns: PdfTableColumn[], font: PDFFont, size = 8): number {
  const maxLines = values.reduce((max, value, index) => Math.max(max, wrapPdfText(value, font, size, Math.max(12, columns[index].width - 14)).length), 1);
  return Math.max(23, maxLines * (size + 3) + 9);
}

export function drawPdfTableHeader(page: PDFPage, x: number, y: number, columns: PdfTableColumn[], font: PDFFont): number {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  page.drawRectangle({ x, y: y - 5, width, height: 19, color: PDF_COLORS.navy });
  let cursorX = x;
  columns.forEach((column) => {
    const label = sanitizePdfText(column.label).toUpperCase();
    if (column.align === "right") drawPdfRightText(page, label, cursorX + column.width - 7, y + 1, 7, font, PDF_COLORS.white);
    else page.drawText(label, { x: cursorX + 7, y: y + 1, size: 7, font, color: PDF_COLORS.white });
    cursorX += column.width;
  });
  return y - 19;
}

export function drawPdfTableRow(
  page: PDFPage,
  x: number,
  y: number,
  values: string[],
  columns: PdfTableColumn[],
  font: PDFFont,
  index: number,
  size = 8,
): number {
  const rowHeight = measurePdfTableRow(values, columns, font, size);
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  if (index % 2 === 1) page.drawRectangle({ x, y: y - rowHeight + 5, width: tableWidth, height: rowHeight, color: PDF_COLORS.surface });
  page.drawLine({ start: { x, y: y - rowHeight + 5 }, end: { x: x + tableWidth, y: y - rowHeight + 5 }, thickness: 0.4, color: PDF_COLORS.line });
  let cursorX = x;
  values.forEach((value, columnIndex) => {
    const column = columns[columnIndex];
    const lines = wrapPdfText(value, font, size, Math.max(12, column.width - 14));
    lines.forEach((line, lineIndex) => {
      const lineY = y - 8 - lineIndex * (size + 3);
      if (column.align === "right") drawPdfRightText(page, line, cursorX + column.width - 7, lineY, size, font, column.color ?? PDF_COLORS.ink);
      else page.drawText(line, { x: cursorX + 7, y: lineY, size, font, color: column.color ?? PDF_COLORS.ink });
    });
    cursorX += column.width;
  });
  return y - rowHeight;
}

export async function applyPdfTemplate(params: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  backgroundBytes: Uint8Array;
  backgroundImage?: PDFImage;
  safeArea?: PdfSafeArea;
}): Promise<{ safeArea: PdfSafeArea; contentX: number; contentTopY: number; contentBottomY: number; contentWidth: number }> {
  const safeArea = params.safeArea ?? PDF_TEMPLATE_SAFE_AREA;
  const { width, height } = params.page.getSize();
  const image = params.backgroundImage ?? (await embedTemplateImage(params.pdfDoc, params.backgroundBytes));
  const fonts = await embedPdfFonts(params.pdfDoc);
  const logoSize = 36;
  const logoScale = Math.min(logoSize / image.width, logoSize / image.height);
  const logoWidth = image.width * logoScale;
  const logoHeight = image.height * logoScale;
  const left = safeArea.left;

  params.page.drawRectangle({ x: 0, y: 0, width, height, color: PDF_COLORS.white });
  params.page.drawImage(image, { x: left, y: height - 52 - logoHeight / 2, width: logoWidth, height: logoHeight });
  params.page.drawText("My Accurate Rent", { x: left + logoSize + 10, y: height - 38, size: 10.5, font: fonts.bold, color: PDF_COLORS.navy });
  params.page.drawText("PROPERTY MANAGEMENT", { x: left + logoSize + 10, y: height - 51, size: 6.5, font: fonts.regular, color: PDF_COLORS.muted });
  params.page.drawLine({ start: { x: left, y: height - 76 }, end: { x: width - safeArea.right, y: height - 76 }, thickness: 0.9, color: PDF_COLORS.line });

  const contentX = left;
  const contentWidth = width - safeArea.left - safeArea.right;
  const contentTopY = height - safeArea.top;
  const contentBottomY = safeArea.bottom;
  return { safeArea, contentX, contentTopY, contentBottomY, contentWidth };
}

export async function finalizePdfDocument(
  pdfDoc: PDFDocument,
  fonts: PdfFonts,
  options: { title: string; subject?: string; reference?: string; author?: string; contact?: string },
): Promise<void> {
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const left = PDF_TEMPLATE_SAFE_AREA.left;

  pdfDoc.setTitle(sanitizePdfText(options.title, "My Accurate Rent Document"));
  pdfDoc.setAuthor(sanitizePdfText(options.author, "My Accurate Rent"));
  pdfDoc.setSubject(sanitizePdfText(options.subject || options.title));
  pdfDoc.setCreator("My Accurate Rent");
  pdfDoc.setProducer("My Accurate Rent PDF Design System");

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const y = 32;
    page.drawLine({ start: { x: left, y: y + 12 }, end: { x: width - PDF_TEMPLATE_SAFE_AREA.right, y: y + 12 }, thickness: 0.6, color: PDF_COLORS.line });
    page.drawText(`My Accurate Rent  |  ${sanitizePdfText(options.contact || "support@soranapropertymanagers.com")}`, { x: left, y, size: 6.5, font: fonts.regular, color: PDF_COLORS.muted });
    drawPdfRightText(page, `Page ${index + 1} of ${totalPages}`, width - PDF_TEMPLATE_SAFE_AREA.right, y, 6.5, fonts.regular, PDF_COLORS.muted);
    if (options.reference) page.drawText(`Reference: ${sanitizePdfText(options.reference)}`, { x: left, y: y - 11, size: 6, font: fonts.regular, color: PDF_COLORS.muted });
  });
}

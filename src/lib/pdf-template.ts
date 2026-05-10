import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";

export const A4_PAGE_SIZE: [number, number] = [595.28, 841.89];

export const PDF_TEMPLATE_PUBLIC_PATH = "/pdf/sorana-letterhead.jpeg";

// Margins (in PDF points) that keep content away from the background logo/header/footer.
export const PDF_TEMPLATE_SAFE_AREA = {
  left: 50,
  right: 50,
  top: 170,
  bottom: 105,
} as const;

export type PdfSafeArea = typeof PDF_TEMPLATE_SAFE_AREA;

const isPng = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

export async function embedTemplateImage(pdfDoc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  return isPng(bytes) ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
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
  params.page.drawImage(image, { x: 0, y: 0, width, height });

  const contentX = safeArea.left;
  const contentWidth = width - safeArea.left - safeArea.right;
  const contentTopY = height - safeArea.top;
  const contentBottomY = safeArea.bottom;

  return { safeArea, contentX, contentTopY, contentBottomY, contentWidth };
}

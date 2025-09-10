import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import logger from "../../../lib/logger";
import * as fs from "fs";
import * as path from "path";

interface Report {
  _id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string | null;
  tenantName: string;
  revenue: number;
  date: string;
  status: string;
  ownerId: string;
  tenantPaymentStatus: string;
  type: string;
  unitType?: string;
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
}

interface GeneratePDFRequest {
  reports: Report[];
  selectedPropertyId: string;
  paymentType: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  properties: Property[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  try {
    const body: GeneratePDFRequest = await request.json();
    const { reports, selectedPropertyId, paymentType, startDate, endDate, totalRevenue, properties } = body;

    // Validate input
    if (!Array.isArray(reports) || reports.length === 0) {
      logger.error("No reports provided for PDF generation");
      return NextResponse.json(
        { success: false, message: "No reports provided" },
        { status: 400 }
      );
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 12;
    const titleFontSize = 24;
    const margin = 50;
    const topMargin = 180; // Margin to accommodate background image

    // Read and embed background image
    const imagePath = path.join(process.cwd(), "public", "bg.png");
    const imageBuffer = fs.readFileSync(imagePath);
    const backgroundImage = await pdfDoc.embedPng(imageBuffer);
    page.drawImage(backgroundImage, {
      x: 0,
      y: 0,
      width,
      height,
    });

    // Colors
    const titleColor = rgb(0.0039, 0.1647, 0.2902);
    const textColor = rgb(0, 0, 0);

    // Header
    page.drawText("Smart Choice Rental Management", {
      x: margin,
      y: height - topMargin - titleFontSize,
      size: titleFontSize,
      font: boldFont,
      color: titleColor,
    });
    page.drawText("PO Box 617-10300 Kerugoya", {
      x: margin,
      y: height - topMargin - titleFontSize - 20,
      size: fontSize,
      font,
      color: textColor,
    });
    page.drawText("management@gmail.com", {
      x: margin,
      y: height - topMargin - titleFontSize - 35,
      size: fontSize,
      font,
      color: textColor,
    });
    page.drawText("0702036837 • 0117649850", {
      x: margin,
      y: height - topMargin - titleFontSize - 50,
      size: fontSize,
      font,
      color: textColor,
    });

    // Title
    page.drawText("Financial Report", {
      x: margin,
      y: height - topMargin - titleFontSize - 80,
      size: titleFontSize,
      font: boldFont,
      color: titleColor,
    });
    page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: margin,
      y: height - topMargin - titleFontSize - 110,
      size: fontSize,
      font,
      color: textColor,
    });

    // Filters
    const filterDetails = [
      {
        label: "Property",
        value:
          selectedPropertyId === "all"
            ? "All Properties"
            : properties.find((p) => p._id === selectedPropertyId)?.name || "Selected Property",
      },
      { label: "Payment Type", value: paymentType === "all" ? "All Types" : paymentType },
      {
        label: "Date Range",
        value:
          startDate && endDate
            ? `${startDate} to ${endDate}`
            : startDate
            ? `From ${startDate}`
            : endDate
            ? `Up to ${endDate}`
            : "All Dates",
      },
      { label: "Total Revenue", value: `KES ${totalRevenue.toFixed(2)}` },
    ];

    let y = height - topMargin - titleFontSize - 140;
    for (const { label, value } of filterDetails) {
      page.drawText(`${label}:`, {
        x: margin,
        y,
        size: fontSize,
        font: boldFont,
        color: textColor,
      });
      page.drawText(value, {
        x: margin + 100,
        y,
        size: fontSize,
        font,
        color: textColor,
      });
      y -= fontSize + 10;
    }

    // Format date function (moved before usage)
    const formatDate = (dateString: string): string => {
      if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return "N/A";
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
    };

    // Table headers
    const tableTop = y - 20;
    const headers =
      selectedPropertyId === "all"
        ? ["Property", "Tenant", "Revenue (KES)", "Date", "Status", "Type", " Payment Status"]
        : ["Property", "Tenant", "Revenue (KES)", "Date", "Status", "Type", "Unit Type", " Payment Status"];

    // Calculate column widths dynamically
    const maxContentWidths = headers.map((header, index) => {
      // Estimate width for header
      const headerWidth = font.widthOfTextAtSize(header, fontSize) + 10; // Add padding

      // Estimate width for column content
      const contentWidths = reports.map((report) => {
        const row = [
          report.propertyName,
          report.tenantName,
          report.revenue.toFixed(2),
          formatDate(report.date),
          report.status,
          report.type,
        ];
        if (selectedPropertyId !== "all") {
          row.push(report.unitType || "N/A");
        }
        row.push(report.tenantPaymentStatus);
        return font.widthOfTextAtSize(row[index] || "N/A", fontSize) + 10; // Add padding
      });

      return Math.max(headerWidth, ...contentWidths);
    });

    // Total available width (A4 width - margins)
    const availableWidth = 595 - 2 * margin; // 495 points
    const totalContentWidth = maxContentWidths.reduce((a, b) => a + b, 0);

    // Scale widths if they exceed available width, enforce minimum width
    const minColumnWidth = 50;
    const columnWidths = maxContentWidths.map((width) =>
      Math.max(minColumnWidth, totalContentWidth > availableWidth ? (width / totalContentWidth) * availableWidth : width)
    );

    // Draw "Reports:" label
    page.drawText("Reports:", {
      x: margin,
      y: tableTop,
      size: fontSize,
      font: boldFont,
      color: textColor,
    });

    // Draw table headers
    y = tableTop - 20;
    headers.forEach((header, i) => {
      const x = margin + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      page.drawText(header, {
        x,
        y,
        size: fontSize,
        font: boldFont,
        color: textColor,
        maxWidth: columnWidths[i], // Prevent overflow
      });
    });

    // Draw underline
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    page.drawLine({
      start: { x: margin, y: y - 5 },
      end: { x: margin + totalWidth, y: y - 5 },
      thickness: 1,
      color: textColor,
    });

    // Table rows with multi-page support
    y -= 20;
    reports.forEach((report) => {
      if (y < margin) {
        // Add new page
        page = pdfDoc.addPage([595, 842]);
        page.drawImage(backgroundImage, {
          x: 0,
          y: 0,
          width,
          height,
        });
        y = height - margin - 20;
        // Redraw headers on new page
        headers.forEach((header, i) => {
          const x = margin + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
          page.drawText(header, {
            x,
            y,
            size: fontSize,
            font: boldFont,
            color: textColor,
            maxWidth: columnWidths[i],
          });
        });
        y -= 20;
        page.drawLine({
          start: { x: margin, y: y - 5 },
          end: { x: margin + totalWidth, y: y - 5 },
          thickness: 1,
          color: textColor,
        });
        y -= 20;
      }

      const row = [
        report.propertyName,
        report.tenantName,
        report.revenue.toFixed(2),
        formatDate(report.date),
        report.status,
        report.type,
      ];
      if (selectedPropertyId !== "all") {
        row.push(report.unitType || "N/A");
      }
      row.push(report.tenantPaymentStatus);

      row.forEach((cell, i) => {
        const x = margin + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
        page.drawText(cell, {
          x,
          y,
          size: fontSize,
          font,
          color: textColor,
          maxWidth: columnWidths[i], // Prevent overflow
        });
      });
      y -= fontSize + 10;
    });

    // Save PDF and encode base64
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    logger.info("PDF generated successfully", {
      reportCount: reports.length,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json({ success: true, pdf: pdfBase64 }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Error generating PDF", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json(
      { success: false, message: "Server error while generating report" },
      { status: 500 }
    );
  }
}
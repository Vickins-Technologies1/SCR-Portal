// src/app/api/generate-excel/route.ts
import { NextRequest, NextResponse } from "next/server";
import logger from "../../../lib/logger";
import * as ExcelJS from "exceljs";
import { format } from "date-fns";

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

interface GenerateExcelRequest {
  reports: Report[];
  selectedPropertyId: string;
  paymentType: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  properties: Property[];
}

function groupByMonth(
  reports: Report[],
  selectedPropertyId: string
): Map<string, Report[]> {
  const map = new Map<string, Report[]>();

  reports.forEach((r) => {
    const monthKey = r.date.slice(0, 7);
    if (!map.has(monthKey)) map.set(monthKey, []);
    map.get(monthKey)!.push(r);
  });

  const sorted = new Map(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
  return sorted;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const startTime = Date.now();
  try {
    const body: GenerateExcelRequest = await request.json();
    const {
      reports,
      selectedPropertyId,
      paymentType,
      startDate,
      endDate,
      totalRevenue,
      properties,
    } = body;

    if (!Array.isArray(reports) || reports.length === 0) {
      logger.error("No reports provided for Excel generation");
      return NextResponse.json(
        { success: false, message: "No reports provided" },
        { status: 400 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Monthly Contributions", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    const propertyLabel =
      selectedPropertyId === "all"
        ? "All Properties"
        : properties.find((p) => p._id === selectedPropertyId)?.name ??
          "Selected Property";

    sheet.mergeCells("A1:G1");
    const companyRow = sheet.getCell("A1");
    companyRow.value = "Smart Choice Rental Management";
    companyRow.font = { bold: true, size: 20, color: { argb: "FF00334D" } };
    companyRow.alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells("A2:G2");
    const contactRow = sheet.getCell("A2");
    contactRow.value = "PO Box 617-10300 Kerugoya • management@gmail.com • 0702036837 • 0117649850";
    contactRow.font = { size: 11, italic: true, color: { argb: "FF555555" } };
    contactRow.alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells("A4:G5");
    const titleCell = sheet.getCell("A4");
    titleCell.value = "Monthly Financial Contributions Report";
    titleCell.font = { bold: true, size: 28, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF00334D" },
    };

    sheet.mergeCells("A6:G6");
    const genDateCell = sheet.getCell("A6");
    genDateCell.value = `Generated on ${new Date().toLocaleDateString()}`;
    genDateCell.font = { size: 12, italic: true, color: { argb: "FF00334D" } };
    genDateCell.alignment = { horizontal: "center", vertical: "middle" };

    let currentRow = 8;
    sheet.getRow(currentRow).values = ["Applied Filters:"];
    sheet.getRow(currentRow).font = { bold: true, size: 14, color: { argb: "FF00334D" } };
    currentRow++;

    const filterDetails = [
      `Property: ${propertyLabel}`,
      `Payment Type: ${paymentType === "all" ? "All Types" : paymentType}`,
      `Date Range: ${
        startDate && endDate
          ? `${startDate} to ${endDate}`
          : startDate
          ? `From ${startDate}`
          : endDate
          ? `Up to ${endDate}`
          : "All Dates"
      }`,
      `Total Revenue: KES ${totalRevenue.toFixed(2)}`,
    ];

    filterDetails.forEach((filter) => {
      sheet.getRow(currentRow).values = [filter];
      sheet.getRow(currentRow).font = { size: 12 };
      currentRow++;
    });

    currentRow++;

    const baseHeaders = [
      "Property",
      "Tenant",
      "Revenue (KES)",
      "Date",
      "Status",
      "Type",
      "Payment Status",
    ];
    if (selectedPropertyId !== "all") {
      baseHeaders.splice(6, 0, "Unit Type");
    }
    const headerRow = sheet.getRow(currentRow);
    headerRow.values = baseHeaders;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF00334D" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    currentRow++;

    const monthGroups = groupByMonth(reports, selectedPropertyId);
    let grandTotal = 0;

    monthGroups.forEach((monthReports, monthKey) => {
      const monthName = format(new Date(monthKey + "-01"), "MMMM yyyy");

      sheet.mergeCells(`A${currentRow}:G${currentRow}`);
      const monthHeaderCell = sheet.getCell(`A${currentRow}`);
      monthHeaderCell.value = `> ${monthName}`;
      monthHeaderCell.font = { bold: true, size: 14, color: { argb: "FF00334D" } };
      monthHeaderCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE6F0FA" },
      };
      monthHeaderCell.alignment = { horizontal: "left", vertical: "middle" };
      currentRow++;

      let monthSubtotal = 0;

      monthReports.forEach((r) => {
        const rowValues = [
          r.propertyName,
          r.tenantName,
          r.revenue,
          format(new Date(r.date), "dd MMM yyyy"),
          r.status,
          r.type,
        ];
        if (selectedPropertyId !== "all") {
          rowValues.push(r.unitType ?? "N/A");
        }
        rowValues.push(r.tenantPaymentStatus);

        const dataRow = sheet.getRow(currentRow);
        dataRow.values = rowValues;
        dataRow.getCell(3).numFmt = '#,##0.00';
        dataRow.alignment = { vertical: "middle", wrapText: true };
        monthSubtotal += r.revenue;
        currentRow++;
      });

      const subTotalValues = Array(baseHeaders.length).fill("");
      subTotalValues[1] = "Month Sub-total";
      subTotalValues[2] = monthSubtotal;
      const subRow = sheet.getRow(currentRow);
      subRow.values = subTotalValues;
      subRow.font = { bold: true, color: { argb: "FF00334D" } };
      subRow.getCell(3).numFmt = '#,##0.00';
      subRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
      };
      grandTotal += monthSubtotal;
      currentRow++;
      currentRow++;
    });

    sheet.mergeCells(`A${currentRow}:B${currentRow}`);
    const grandLabelCell = sheet.getCell(`A${currentRow}`);
    grandLabelCell.value = "GRAND TOTAL";
    grandLabelCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    grandLabelCell.alignment = { horizontal: "right", vertical: "middle" };

    const grandValueCell = sheet.getCell(`C${currentRow}`);
    grandValueCell.value = grandTotal;
    grandValueCell.numFmt = '#,##0.00';
    grandValueCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    grandValueCell.alignment = { horizontal: "center", vertical: "middle" };

    sheet.getRow(currentRow).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF00334D" },
    };

    sheet.columns = baseHeaders.map((_, i) => ({
      width: [22, 22, 16, 14, 14, 12, 14, 18][i] || 16,
    }));

    const dataStartRow = 10 + filterDetails.length + 1;
    const dataEndRow = currentRow;
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      const row = sheet.getRow(r);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(buffer).toString("base64");

    logger.info("Excel generated successfully", {
      reportCount: reports.length,
      monthCount: monthGroups.size,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json(
      { success: true, excel: excelBase64 },
      { status: 200 }
    );
  } catch (error) {
    const err = error as Error;
    logger.error("Error generating Excel", {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json(
      { success: false, message: "Server error while generating report" },
      { status: 500 }
    );
  }
}
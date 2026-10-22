// src/app/api/generate-excel/route.ts
import { NextRequest, NextResponse } from "next/server";
import logger from "../../../lib/logger";
import * as ExcelJS from "exceljs";
import { format } from "date-fns";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../../../lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../lib/csrf";
import { categorizeFinancialPaymentRows, getFinancialPaymentRows } from "@/lib/financial-reporting";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { identityValues } from "@/lib/payment-query";

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
  reference?: string;
  transactionId?: string;
  mpesaCode?: string;
  isManual?: boolean;
}

interface GenerateExcelRequest {
  selectedPropertyId?: string;
  paymentType?: string;
  startDate?: string;
  endDate?: string;
}

const getPaymentReference = (report: Report): string => {
  const isManual = report.isManual ?? report.transactionId?.startsWith("MANUAL-");
  if (isManual) {
    return report.reference || report.transactionId || "N/A";
  }
  return report.mpesaCode || report.transactionId || "N/A";
};

function groupByMonth(
  reports: Report[]
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
    const selectedPropertyId = body.selectedPropertyId || "all";
    const paymentType = body.paymentType || "all";
    const startDate = body.startDate || "";
    const endDate = body.endDate || "";
    const loggedInUserId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;

    if (!loggedInUserId || !ObjectId.isValid(loggedInUserId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
      return buildInvalidCsrfResponse(request);
    }

    const { db } = await connectToDatabase();
    let effectiveOwnerId = loggedInUserId;
    let assignedPropertyIds: string[] | null = null;
    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({ _id: new ObjectId(loggedInUserId), active: true });
      if (!teamMember?.ownerId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      effectiveOwnerId = String(teamMember.ownerId);
      assignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
        ? (teamMember as any).assignedPropertyIds.map((value: unknown) => String(value)).filter((value: string) => ObjectId.isValid(value))
        : null;
    }

    const propertiesQuery: Record<string, unknown> = { ownerId: { $in: identityValues(effectiveOwnerId) } };
    if (role === "teamMember" && assignedPropertyIds?.length) {
      propertiesQuery._id = { $in: assignedPropertyIds.map((id) => new ObjectId(id)) };
    }
    const properties = await db.collection("properties").find(propertiesQuery).toArray();
    const propertyIds = properties.map((property) => String(property._id));
    if (selectedPropertyId !== "all" && !propertyIds.includes(selectedPropertyId)) {
      return NextResponse.json({ success: false, message: "Unauthorized: Property not owned" }, { status: 403 });
    }

    const parseBusinessDate = (value: string, endOfDay = false) => {
      if (!value) return undefined;
      return new Date(`${value.slice(0, 10)}${endOfDay ? "T23:59:59.999+03:00" : "T00:00:00.000+03:00"}`);
    };
    const tenants = await db.collection("tenants")
      .find({ propertyId: { $in: identityValues(selectedPropertyId === "all" ? propertyIds : [selectedPropertyId]) } })
      .toArray();
    const selectedProperties = properties.filter((property) =>
      selectedPropertyId === "all" || String(property._id) === selectedPropertyId
    );
    const propertyForTenantMap = new Map(selectedProperties.map((property: any) => [String(property._id), property]));
    const tenantStates = await Promise.all(tenants.map((tenant: any) =>
      calculateTenantFinancialState(db, tenant, { property: propertyForTenantMap.get(String(tenant.propertyId)), asOf: new Date() })
    ));
    const allocationOverrides = new Map<string, any>();
    for (const state of tenantStates) {
      for (const [paymentId, allocation] of state.paymentAllocations) allocationOverrides.set(paymentId, allocation);
    }
    const rows = await getFinancialPaymentRows({
      db,
      propertyIds: selectedPropertyId === "all" ? propertyIds : [selectedPropertyId],
      tenantIdsForLegacyPropertyless: tenants.map((tenant: any) => tenant._id),
      start: parseBusinessDate(startDate),
      end: parseBusinessDate(endDate, true),
    });
    const tenantMap = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
    const propertyMap = new Map(properties.map((property) => [String(property._id), property]));
    const reports: Report[] = categorizeFinancialPaymentRows(rows, allocationOverrides)
      .filter(({ type }) => !paymentType || paymentType === "all" || type === paymentType)
      .map(({ row, type, amount }) => {
        const { payment, eventDate } = row;
        const tenant = payment.tenantId ? tenantMap.get(String(payment.tenantId)) : null;
        const propertyId = String(payment.propertyId || tenant?.propertyId || "");
        return {
          _id: `${String(payment._id)}:${type}`,
          propertyId,
          propertyName: propertyMap.get(propertyId)?.name || "Unassigned",
          tenantId: payment.tenantId ? String(payment.tenantId) : null,
          tenantName: tenant?.name || payment.tenantName || "Unknown",
          revenue: amount,
          date: (eventDate || new Date(0)).toISOString(),
          status: String(payment.status || "completed"),
          ownerId: effectiveOwnerId,
          tenantPaymentStatus: tenant?.paymentStatus || "Unknown",
          unitType: tenant?.unitType || payment.unitType || "N/A",
          type,
          transactionId: payment.transactionId,
          reference: payment.reference,
          mpesaCode: payment.mpesaCode,
          isManual: String(payment.transactionId || "").startsWith("MANUAL-"),
        };
      });

    if (reports.length === 0) {
      return NextResponse.json({ success: false, message: "No reports provided" }, { status: 400 });
    }
    const totalRevenue = reports.reduce((sum, report) => sum + report.revenue, 0);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Monthly Contributions", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    const propertyLabel = selectedPropertyId === "all"
      ? "All Properties"
      : properties.find((property) => String(property._id) === selectedPropertyId)?.name ?? "Selected Property";

    const totalColumns = selectedPropertyId === "all" ? 8 : 9;
    const lastColumn = String.fromCharCode(64 + totalColumns);

    sheet.mergeCells(`A1:${lastColumn}1`);
    const companyRow = sheet.getCell("A1");
    companyRow.value = "My Accurate Rent";
    companyRow.font = { bold: true, size: 20, color: { argb: "FF00334D" } };
    companyRow.alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells(`A2:${lastColumn}2`);
    const contactRow = sheet.getCell("A2");
    contactRow.value = "PO Box 617-10300 Kerugoya • management@gmail.com • 0702036837 • 0117649850";
    contactRow.font = { size: 11, italic: true, color: { argb: "FF555555" } };
    contactRow.alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells(`A4:${lastColumn}5`);
    const titleCell = sheet.getCell("A4");
    titleCell.value = "Monthly Financial Contributions Report";
    titleCell.font = { bold: true, size: 28, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF00334D" },
    };

    sheet.mergeCells(`A6:${lastColumn}6`);
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
      "Reference",
      "Type",
      "Payment Status",
    ];
    if (selectedPropertyId !== "all") {
      baseHeaders.splice(7, 0, "Unit Type");
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

    const monthGroups = groupByMonth(reports);
    let grandTotal = 0;

    monthGroups.forEach((monthReports, monthKey) => {
      const monthName = format(new Date(monthKey + "-01"), "MMMM yyyy");

      sheet.mergeCells(`A${currentRow}:${lastColumn}${currentRow}`);
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
          getPaymentReference(r),
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
      width: [22, 22, 16, 14, 14, 18, 12, 14, 18][i] || 16,
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


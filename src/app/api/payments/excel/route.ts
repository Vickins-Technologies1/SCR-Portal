// src/app/api/payments/excel/route.ts
import { NextRequest, NextResponse } from "next/server";
import logger from "../../../../lib/logger";
import * as ExcelJS from "exceljs";
import { format } from "date-fns";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { getFinancialPaymentRows } from "@/lib/financial-reporting";
import { identityValues } from "@/lib/payment-query";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { ownerId } = body;
    const sessionUserId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;

    if (!ownerId || ownerId === "all") {
      return NextResponse.json({ success: false, message: "Select a specific owner" }, { status: 400 });
    }
    if (!sessionUserId || !ObjectId.isValid(sessionUserId) || !ObjectId.isValid(String(ownerId)) || !["admin", "propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
      return buildInvalidCsrfResponse(request);
    }

    const effectiveOwnerId = String(ownerId);
    let assignedPropertyIds: string[] | null = null;
    if (role === "propertyOwner" && sessionUserId !== effectiveOwnerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({ _id: new ObjectId(sessionUserId), active: true });
      if (!teamMember?.ownerId || String(teamMember.ownerId) !== effectiveOwnerId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }
      assignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
        ? (teamMember as any).assignedPropertyIds.map((value: unknown) => String(value)).filter((value: string) => ObjectId.isValid(value))
        : null;
    }

    logger.info("Excel export started", { ownerId: effectiveOwnerId });

    const propertiesQuery: Record<string, unknown> = { ownerId: { $in: identityValues(effectiveOwnerId) } };
    if (role === "teamMember" && assignedPropertyIds?.length) {
      propertiesQuery._id = { $in: assignedPropertyIds.map((id) => new ObjectId(id)) };
    }
    const properties = await db
      .collection("properties")
      .find(propertiesQuery)
      .project({ _id: 1, name: 1 })
      .toArray();

    if (properties.length === 0) {
      logger.warn("No properties for owner", { ownerId });
      return NextResponse.json({ success: true, excel: "", message: "No properties" });
    }

    const propertyIds = properties.map(p => String(p._id));
    logger.info("Found properties", { count: properties.length, names: properties.map(p => p.name) });

    const tenants = await db
      .collection("tenants")
      .find({ propertyId: { $in: identityValues(propertyIds) } })
      .project({ _id: 1, name: 1, unitType: 1, propertyId: 1, phone: 1 })
      .toArray();
    const tenantMap = new Map(tenants.map(t => [String(t._id), t]));
    const propertyMap = new Map(properties.map(p => [String(p._id), p]));
    const rows = await getFinancialPaymentRows({ db, propertyIds });
    const payments = rows.map(({ payment, eventDate, originalAmount, reversedAmount, netAmount }) => {
      const tenant = payment.tenantId ? tenantMap.get(String(payment.tenantId)) : undefined;
      return {
        amount: netAmount,
        originalAmount,
        reversedAmount,
        paymentDate: eventDate || new Date(0),
        transactionId: payment.transactionId,
        type: payment.type,
        tenantName: tenant?.name || payment.tenantName || "Guest",
        unitType: tenant?.unitType || payment.unitType || "N/A",
        propertyName: propertyMap.get(String(payment.propertyId))?.name || "Unknown",
        phoneNumber: tenant?.phone || payment.phoneNumber || "—",
      };
    });

    if (payments.length === 0) {
      logger.info("No payments found", { ownerId });
      return NextResponse.json({ success: true, excel: "", message: "No payments yet" });
    }

    const total = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

    logger.info("Payments ready for export", {
      count: payments.length,
      total,
      sample: payments[0]
    });

    // === 4. GENERATE EXCEL ===
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tenant Payments");

    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").value = "SMART CHOICE RENTAL MANAGEMENT";
    sheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FF00334D" } };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.mergeCells("A2:H2");
    sheet.getCell("A2").value = `Payments Report - ${properties[0].name} & More`;
    sheet.getCell("A2").font = { size: 14, bold: true };

    sheet.mergeCells("A3:H3");
    sheet.getCell("A3").value = `Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Total: KES ${total.toLocaleString()}`;
    sheet.getCell("A3").font = { italic: true };

    sheet.addRow([]);
    const header = sheet.addRow([
      "Date", "Transaction ID", "Property", "Tenant", "Unit", "Type", "Amount (KES)", "Phone"
    ]);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00334D" } };

    payments.forEach((p: any) => {
      sheet.addRow([
        format(new Date(p.paymentDate), "dd MMM yyyy"),
        p.transactionId,
        p.propertyName,
        p.tenantName,
        p.unitType,
        p.type || "Rent",
        p.amount,
        p.phoneNumber || "—"
      ]);
    });

    // Total Row
    const totalRow = sheet.addRow([]);
    sheet.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
    sheet.getCell(`A${totalRow.number}`).value = "GRAND TOTAL";
    sheet.getCell(`G${totalRow.number}`).value = total;
    sheet.getCell(`G${totalRow.number}`).numFmt = '#,##0';
    sheet.getRow(totalRow.number).font = { bold: true, size: 14 };
    sheet.getRow(totalRow.number).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F0FA" } };

    sheet.columns.forEach(col => col.width = 18);

    const buffer = await workbook.xlsx.writeBuffer();
    // convert ArrayBuffer/Uint8Array to a Node Buffer then encode to base64
    const base64 = Buffer.from(buffer).toString("base64");

    logger.info("Excel exported", { duration: Date.now() - startTime });

    return NextResponse.json({
      success: true,
      excel: base64,
      filename: `Payments_${format(new Date(), "yyyyMMdd")}.xlsx`
    });

  } catch (error: any) {
    logger.error("Export failed", { error: error.message });
    return NextResponse.json({ success: false, message: "Export failed" }, { status: 500 });
  }
}

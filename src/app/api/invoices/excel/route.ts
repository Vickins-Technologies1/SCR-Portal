// src/app/api/invoices/excel/route.ts
import { NextRequest, NextResponse } from "next/server";
import logger from "../../../../lib/logger";
import * as ExcelJS from "exceljs";
import { format } from "date-fns";
import { connectToDatabase } from "../../../../lib/mongodb";

interface InvoiceRecord {
  _id: any;
  userId: string;
  propertyId: string;
  amount: number;
  status: string;
  reference: string;
  createdAt?: Date | string;
  description?: string;
  billingPlan?: string;
  percentage?: number;
  expectedIncome?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const role = request.cookies.get("role")?.value;
    if (role !== "admin") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ownerId } = body;

    if (!ownerId || ownerId === "all") {
      return NextResponse.json({ success: false, message: "Select a specific owner" }, { status: 400 });
    }

    logger.info("Invoice export started", { ownerId });

    const { db } = await connectToDatabase();

    const properties = await db
      .collection("properties")
      .find({ ownerId })
      .project({ _id: 1, name: 1 })
      .toArray();

    const propertyMap = new Map(
      properties.map((p: any) => [p._id.toString(), p.name])
    );

    const airbnbListings = await db
      .collection("airbnbListings")
      .find({ ownerId })
      .project({ externalId: 1, name: 1 })
      .toArray();

    const airbnbListingMap = new Map<string, string>();
    airbnbListings.forEach((listing: any) => {
      const key = listing.externalId || listing._id?.toString?.();
      if (key) {
        airbnbListingMap.set(String(key), listing.name || "Airbnb Listing");
      }
    });

    const invoices = await db
      .collection<InvoiceRecord>("invoices")
      .find({ userId: ownerId })
      .sort({ createdAt: -1 })
      .toArray();

    if (invoices.length === 0) {
      logger.info("No invoices found for export", { ownerId });
      return NextResponse.json({ success: true, excel: "", message: "No invoice transactions yet" });
    }

    const total = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Invoice Transactions");

    sheet.mergeCells("A1:I1");
    sheet.getCell("A1").value = "SMART CHOICE RENTAL MANAGEMENT";
    sheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FF00334D" } };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.mergeCells("A2:I2");
    sheet.getCell("A2").value = "Invoice Transactions Report";
    sheet.getCell("A2").font = { size: 14, bold: true };

    sheet.mergeCells("A3:I3");
    sheet.getCell("A3").value = `Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Total: KES ${total.toLocaleString()}`;
    sheet.getCell("A3").font = { italic: true };

    sheet.addRow([]);
    const header = sheet.addRow([
      "Date",
      "Reference",
      "Property",
      "Billing Plan",
      "Percentage",
      "Expected Income",
      "Amount (KES)",
      "Status",
      "Description",
    ]);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00334D" } };

    invoices.forEach((inv) => {
      const createdAt = inv.createdAt ? new Date(inv.createdAt) : new Date();
      const billingPlan =
        inv.billingPlan === "FullManagement"
          ? "Full Management"
          : inv.billingPlan === "RentCollection"
          ? "Software Leasing"
          : inv.billingPlan === "Airbnb"
          ? "Airbnb"
          : "Unknown";
      const propertyLabel = inv.billingPlan === "Airbnb"
        ? airbnbListingMap.get(inv.propertyId) || "Airbnb Listing"
        : propertyMap.get(inv.propertyId) || "Unknown";
      sheet.addRow([
        format(createdAt, "dd MMM yyyy"),
        inv.reference || "—",
        propertyLabel,
        billingPlan,
        inv.percentage != null ? `${inv.percentage}%` : "—",
        inv.expectedIncome != null ? inv.expectedIncome : "—",
        inv.amount || 0,
        inv.status || "N/A",
        inv.description || "",
      ]);
    });

    const totalRow = sheet.addRow([]);
    sheet.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
    sheet.getCell(`A${totalRow.number}`).value = "GRAND TOTAL";
    sheet.getCell(`G${totalRow.number}`).value = total;
    sheet.getCell(`G${totalRow.number}`).numFmt = "#,##0";
    sheet.getRow(totalRow.number).font = { bold: true, size: 14 };
    sheet.getRow(totalRow.number).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F0FA" } };

    sheet.columns.forEach((col) => (col.width = 18));

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    logger.info("Invoice export completed", { duration: Date.now() - startTime });

    return NextResponse.json({
      success: true,
      excel: base64,
      filename: `Invoice_Transactions_${format(new Date(), "yyyyMMdd")}.xlsx`,
    });
  } catch (error: any) {
    logger.error("Invoice export failed", { error: error.message });
    return NextResponse.json({ success: false, message: "Export failed" }, { status: 500 });
  }
}

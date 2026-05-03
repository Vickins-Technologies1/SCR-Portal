import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import logger from "@/lib/logger";

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    const csrf =
      request.headers.get("X-CSRF-Token") ||
      request.headers.get("x-csrf-token") ||
      "";
    const storedCsrf = request.cookies.get("csrf-token")?.value || "";

    if (!userId || role !== "admin" || !csrf || csrf !== storedCsrf) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const invoiceId = String(body?.invoiceId || "").trim();
    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      return NextResponse.json({ success: false, message: "Invalid invoice ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    const ownerId = String(invoice.userId || "").trim();
    if (!ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invoice owner is invalid" }, { status: 500 });
    }

    const owner = await db.collection("propertyOwners").findOne(
      { _id: new ObjectId(ownerId) },
      { projection: { name: 1, email: 1, phone: 1 } }
    );
    const to = owner?.email ? String(owner.email).trim() : "";
    if (!to) {
      return NextResponse.json({ success: false, message: "Owner email is missing" }, { status: 400 });
    }

    let propertyName = "Property";
    if (invoice.billingPlan === "Airbnb") {
      const listing = await db.collection("airbnbListings").findOne(
        { ownerId, externalId: String(invoice.propertyId || "") },
        { projection: { name: 1 } }
      );
      propertyName = String(listing?.name || "Airbnb Listing");
    } else if (ObjectId.isValid(String(invoice.propertyId || ""))) {
      const property = await db.collection("properties").findOne(
        { _id: new ObjectId(String(invoice.propertyId)) },
        { projection: { name: 1 } }
      );
      propertyName = String(property?.name || "Property");
    }

    const dueAt = parseDate(invoice.expiresAt);
    const dueDatePretty = (dueAt || new Date()).toLocaleDateString("en-KE", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "")
      .trim()
      .replace(/\/$/, "");
    const dashboardUrl = baseUrl
      ? `${baseUrl}/property-owner-dashboard/reports`
      : "http://localhost:3000/property-owner-dashboard/reports";

    const kopokopoTillNumber = (process.env.KOPOKOPO_TILL_NUMBER || "").trim();
    const { pdfBytes, invoiceNumber } = await generateInvoicePdf({
      invoice: {
        reference: invoice.reference,
        amount: Number(invoice.amount) || 0,
        description: invoice.description,
        items: invoice.items,
        discount: invoice.discount,
        tax: invoice.tax,
      },
      owner: {
        name: owner?.name,
        email: owner?.email,
        phone: owner?.phone,
      },
      property: { name: propertyName },
      now: new Date(),
      kopokopoTillNumber,
    });

    await sendInvoiceEmail({
      to,
      ownerName: owner?.name || "Property Owner",
      propertyName,
      amount: Number(invoice.amount) || 0,
      dueDate: dueDatePretty,
      reminderType: "manual",
      dashboardUrl,
      invoiceNumber,
      pdfBytes,
    });

    await db.collection("invoiceReminderLogs").insertOne({
      ownerId,
      invoiceId: invoiceId,
      invoiceReference: String(invoice.reference || ""),
      propertyId: String(invoice.propertyId || ""),
      propertyName,
      amount: Number(invoice.amount) || 0,
      reminderType: "manual",
      dueDate: dueAt ? `${dueAt.getFullYear()}-${String(dueAt.getMonth() + 1).padStart(2, "0")}-${String(dueAt.getDate()).padStart(2, "0")}` : null,
      createdAt: new Date().toISOString(),
      status: "success",
      initiatedBy: userId,
    });

    await db.collection("auditLogs").insertOne({
      action: "invoice_email_sent",
      ownerId,
      invoiceId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      timestamp: new Date().toISOString(),
      status: "success",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("POST /api/admin/invoices/send-email failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Failed to send invoice email" }, { status: 500 });
  }
}


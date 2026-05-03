import "server-only";

import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { sendInvoiceEmail } from "@/lib/email";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

type InvoiceReminderType = "fiveDaysBefore" | "dueDate";

type InvoiceDoc = {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  amount: number;
  status: "pending" | "completed" | "failed" | string;
  reference: string;
  createdAt?: Date | string;
  expiresAt?: Date | string;
  description?: string;
  billingPlan?: string;
  items?: Array<{ description: string; qty: number; rate: number }>;
  discount?: number;
  tax?: number;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function sendInvoiceReminders(params: { today?: Date } = {}) {
  const today = params.today ?? new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const fiveDaysAhead = addDays(todayStart, 5);
  const fiveDaysAheadStart = startOfDay(fiveDaysAhead);
  const fiveDaysAheadEnd = endOfDay(fiveDaysAhead);

  const { db } = await connectToDatabase();

  const invoices = await db.collection<InvoiceDoc>("invoices").find({
    status: "pending",
    expiresAt: { $exists: true },
    $or: [
      { expiresAt: { $gte: todayStart, $lte: todayEnd } },
      { expiresAt: { $gte: fiveDaysAheadStart, $lte: fiveDaysAheadEnd } },
    ],
  }).toArray();

  if (invoices.length === 0) {
    return { sent: 0, skipped: 0 };
  }

  const ownerIds = Array.from(
    new Set(invoices.map((inv) => String(inv.userId)).filter(Boolean))
  ).filter((id) => ObjectId.isValid(id));

  const owners = ownerIds.length
    ? await db
        .collection("propertyOwners")
        .find({ _id: { $in: ownerIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, email: 1, phone: 1 })
        .toArray()
    : [];
  const ownerMap = new Map(
    owners.map((o: any) => [o._id.toString(), { name: o.name, email: o.email, phone: o.phone }])
  );

  const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  const dashboardUrl = baseUrl ? `${baseUrl}/property-owner-dashboard/reports` : "http://localhost:3000/property-owner-dashboard/reports";

  const kopokopoTillNumber = (process.env.KOPOKOPO_TILL_NUMBER || "").trim();

  let sent = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const dueAt = parseDate(invoice.expiresAt);
    if (!dueAt) {
      skipped += 1;
      continue;
    }

    const reminderType: InvoiceReminderType =
      dueAt >= todayStart && dueAt <= todayEnd ? "dueDate" : "fiveDaysBefore";
    const dueDateKey = toDateKey(dueAt);

    const ownerId = String(invoice.userId || "");
    if (!ObjectId.isValid(ownerId)) {
      skipped += 1;
      continue;
    }

    const existing = await db.collection("invoiceReminderLogs").findOne({
      ownerId,
      reminderType,
      dueDate: dueDateKey,
      invoiceId: invoice._id.toString(),
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const owner = ownerMap.get(ownerId);
    const to = owner?.email ? String(owner.email).trim() : "";
    if (!to) {
      skipped += 1;
      continue;
    }

    let propertyName = "Property";
    if (invoice.billingPlan === "Airbnb") {
      const listing = await db.collection("airbnbListings").findOne(
        { ownerId, externalId: invoice.propertyId },
        { projection: { name: 1 } }
      );
      propertyName = String(listing?.name || "Airbnb Listing");
    } else if (ObjectId.isValid(invoice.propertyId)) {
      const property = await db.collection("properties").findOne(
        { _id: new ObjectId(invoice.propertyId) },
        { projection: { name: 1 } }
      );
      propertyName = String(property?.name || "Property");
    }

    const dueDatePretty = dueAt.toLocaleDateString("en-KE", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    try {
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
        reminderType,
        dashboardUrl,
        invoiceNumber,
        pdfBytes,
      });

      await db.collection("invoiceReminderLogs").insertOne({
        ownerId,
        invoiceId: invoice._id.toString(),
        invoiceReference: invoice.reference,
        propertyId: invoice.propertyId,
        propertyName,
        amount: Number(invoice.amount) || 0,
        reminderType,
        dueDate: dueDateKey,
        createdAt: new Date().toISOString(),
        status: "success",
      });

      sent += 1;
    } catch (error) {
      logger.error("Failed to send invoice reminder", {
        ownerId,
        invoiceId: invoice._id.toString(),
        message: error instanceof Error ? error.message : String(error),
      });

      await db.collection("invoiceReminderLogs").insertOne({
        ownerId,
        invoiceId: invoice._id.toString(),
        invoiceReference: invoice.reference,
        propertyId: invoice.propertyId,
        propertyName,
        amount: Number(invoice.amount) || 0,
        reminderType,
        dueDate: dueDateKey,
        createdAt: new Date().toISOString(),
        status: "failed",
        errorDetails: error instanceof Error ? error.message : String(error),
      });

      skipped += 1;
    }
  }

  return { sent, skipped };
}

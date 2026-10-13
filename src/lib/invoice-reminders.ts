import "server-only";

import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { sendInvoiceEmail } from "@/lib/email";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { calculateInvoiceFinancialState } from "@/lib/financial-reporting";

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

export function isInvoiceReminderStatusEligible(status: unknown): boolean {
  return !["completed", "failed", "cancelled", "paid"].includes(String(status || "").trim().toLowerCase());
}

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
    status: { $nin: ["completed", "failed", "cancelled", "paid", "PAID"] },
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

  let sent = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const currentInvoice = await db.collection<InvoiceDoc>("invoices").findOne({ _id: invoice._id });
    if (!currentInvoice || !isInvoiceReminderStatusEligible(currentInvoice.status)) {
      skipped += 1;
      continue;
    }

    const dueAt = parseDate(currentInvoice.expiresAt);
    if (!dueAt) {
      skipped += 1;
      continue;
    }

    const reminderType: InvoiceReminderType =
      dueAt >= todayStart && dueAt <= todayEnd ? "dueDate" : "fiveDaysBefore";
    const dueDateKey = toDateKey(dueAt);

    const ownerId = String(currentInvoice.userId || "");
    if (!ObjectId.isValid(ownerId)) {
      skipped += 1;
      continue;
    }

    const reminderKey = `invoice:${ownerId}:${currentInvoice._id.toString()}:${reminderType}:${dueDateKey}`;
    const existing = await db.collection("invoiceReminderLogs").findOne({
      $or: [
        { reminderKey },
        {
          ownerId,
          reminderType,
          dueDate: dueDateKey,
          invoiceId: currentInvoice._id.toString(),
        },
      ],
    });
    const existingUpdatedAt = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : NaN;
    const existingClaimIsFresh = Number.isFinite(existingUpdatedAt) && Date.now() - existingUpdatedAt < 15 * 60 * 1000;
    if (existing && (existing.status === "success" || (existing.status === "processing" && existingClaimIsFresh))) {
      skipped += 1;
      continue;
    }

    let calculation;
    try {
      calculation = await calculateInvoiceFinancialState(db, currentInvoice);
    } catch (error) {
      logger.error("Unable to calculate invoice reminder balance", {
        invoiceId: currentInvoice._id.toString(),
        ownerId,
        message: error instanceof Error ? error.message : String(error),
      });
      skipped += 1;
      continue;
    }
    if (!Number.isFinite(calculation.balanceDue) || calculation.balanceDue <= 0) {
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
    if (currentInvoice.billingPlan === "Airbnb") {
      const listing = await db.collection("airbnbListings").findOne(
        { ownerId, externalId: currentInvoice.propertyId },
        { projection: { name: 1 } }
      );
      propertyName = String(listing?.name || "Airbnb Listing");
    } else if (ObjectId.isValid(currentInvoice.propertyId)) {
      const property = await db.collection("properties").findOne(
        { _id: new ObjectId(currentInvoice.propertyId) },
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

    const logBase = {
      ownerId,
      invoiceId: currentInvoice._id.toString(),
      invoiceReference: currentInvoice.reference,
      propertyId: currentInvoice.propertyId,
      propertyName,
      amount: calculation.balanceDue,
      invoiceTotal: calculation.total,
      amountPaid: calculation.amountPaid,
      balanceDue: calculation.balanceDue,
      reminderType,
      dueDate: dueDateKey,
      reminderKey,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (existing) {
        const claimed = await db.collection("invoiceReminderLogs").updateOne(
          {
            _id: existing._id,
            status: existing.status,
            ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {}),
          },
          { $set: { ...logBase, status: "processing", errorDetails: null } },
        );
        if (!claimed.matchedCount) {
          skipped += 1;
          continue;
        }
      } else {
        const claimed = await db.collection("invoiceReminderLogs").updateOne(
          { reminderKey },
          { $setOnInsert: { ...logBase, createdAt: new Date().toISOString(), status: "processing" } },
          { upsert: true },
        );
        if (!claimed.upsertedCount) {
          skipped += 1;
          continue;
        }
      }

      // Re-read immediately before rendering/sending. The initial query and
      // PDF generation must never turn a newly paid invoice into a due email.
      const latestInvoice = await db.collection<InvoiceDoc>("invoices").findOne({ _id: currentInvoice._id });
      if (!latestInvoice || !isInvoiceReminderStatusEligible(latestInvoice.status)) {
        await db.collection("invoiceReminderLogs").updateOne(
          { reminderKey },
          { $set: { status: "skipped", skipReason: "invoice_no_longer_eligible", updatedAt: new Date().toISOString() } },
        );
        skipped += 1;
        continue;
      }
      calculation = await calculateInvoiceFinancialState(db, latestInvoice);
      if (!Number.isFinite(calculation.balanceDue) || calculation.balanceDue <= 0) {
        await db.collection("invoiceReminderLogs").updateOne(
          { reminderKey },
          {
            $set: {
              status: "skipped",
              skipReason: "paid_before_send",
              amount: calculation.balanceDue,
              invoiceTotal: calculation.total,
              amountPaid: calculation.amountPaid,
              balanceDue: calculation.balanceDue,
              updatedAt: new Date().toISOString(),
            },
          },
        );
        skipped += 1;
        continue;
      }

      const { pdfBytes, invoiceNumber } = await generateInvoicePdf({
        invoice: {
          reference: latestInvoice.reference,
          billingPlan: latestInvoice.billingPlan,
          amount: Number(latestInvoice.amount) || 0,
          description: latestInvoice.description,
          items: latestInvoice.items,
          discount: latestInvoice.discount,
          tax: latestInvoice.tax,
          dueDate: latestInvoice.expiresAt,
          amountPaid: calculation.amountPaid,
        },
        owner: {
          name: owner?.name,
          email: owner?.email,
          phone: owner?.phone,
        },
        property: { name: propertyName },
        now: new Date(),
      });

      await sendInvoiceEmail({
        to,
        ownerName: owner?.name || "Property Owner",
        propertyName,
        amount: calculation.balanceDue,
        dueDate: dueDatePretty,
        reminderType,
        dashboardUrl,
        invoiceNumber,
        pdfBytes,
      });

      await db.collection("invoiceReminderLogs").updateOne(
        { reminderKey },
        {
          $set: {
            status: "success",
            amount: calculation.balanceDue,
            invoiceTotal: calculation.total,
            amountPaid: calculation.amountPaid,
            balanceDue: calculation.balanceDue,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      sent += 1;
    } catch (error) {
      logger.error("Failed to send invoice reminder", {
        ownerId,
        invoiceId: currentInvoice._id.toString(),
        message: error instanceof Error ? error.message : String(error),
      });

      await db.collection("invoiceReminderLogs").updateOne(
        { reminderKey },
        {
          $set: {
            ...logBase,
            status: "failed",
            errorDetails: error instanceof Error ? error.message : String(error),
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString() },
        },
        { upsert: true },
      );

      skipped += 1;
    }
  }

  return { sent, skipped };
}

import "server-only";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { addInvoicePaymentStates } from "@/lib/tenant-invoices";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";
import logger from "@/lib/logger";

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

type ReminderTask = { kind: "before_due" | "due_date" | "overdue" | "payment_received"; reminderKey: string };

export async function sendTenantInvoiceReminders(today = new Date()) {
  const { db } = await connectToDatabase();
  await db.collection("tenantInvoiceReminderLogs").createIndex({ reminderKey: 1 }, { unique: true, name: "tenantInvoiceReminderLogs_key_unique" });
  const rows = await db.collection("tenantInvoices").find({ status: { $nin: ["draft", "cancelled", "voided", "superseded"] } }).toArray();
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0 };
  const calculated = await addInvoicePaymentStates(db, rows);
  const settingsRows = await db.collection("landlordBillingSettings").find({ invoicingEnabled: true, remindersEnabled: true }).toArray();
  const settings = new Map(settingsRows.map((row: any) => [String(row.landlordId), row]));
  let sent = 0, skipped = 0, failed = 0;
  const currentKey = dayKey(today);
  const todayStart = new Date(`${currentKey}T00:00:00+03:00`);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);

  for (const invoice of calculated) {
    const config: any = settings.get(String(invoice.landlordId));
    if (!config) { skipped++; continue; }
    const tasks: ReminderTask[] = [];
    const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const outstandingMinor = Math.max(0, Number(invoice.balanceMinor) || 0);
    if (outstandingMinor > 0 && due && !Number.isNaN(due.getTime())) {
      const dueStart = new Date(`${dayKey(due)}T00:00:00+03:00`);
      const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);
      let kind: ReminderTask["kind"] | null = null;
      if (Number(config.reminderBeforeDays) > 0 && diffDays === Number(config.reminderBeforeDays)) kind = "before_due";
      else if (config.reminderOnDueDate !== false && diffDays === 0) kind = "due_date";
      else if (diffDays < 0 && Math.abs(diffDays) % Math.max(1, Number(config.overdueReminderEveryDays) || 7) === 0) kind = "overdue";
      if (kind) {
        if (Number(invoice.amountPaidMinor) > 0) kind = kind === "overdue" ? "overdue" : kind;
        tasks.push({ kind, reminderKey: `${invoice._id}:${kind}:${currentKey}` });
      }
    }

    const receiptKeys = new Set<string>();
    for (const allocation of invoice.paymentAllocations || []) {
      if (allocation.reversal || !allocation.paymentId) continue;
      const source = allocation.source === "wallet" ? "wallet" : "payment";
      const receiptKey = `${source}:${allocation.paymentId}`;
      if (receiptKeys.has(receiptKey)) continue;
      receiptKeys.add(receiptKey);
      tasks.push({ kind: "payment_received", reminderKey: `${invoice._id}:payment_received:${receiptKey}` });
    }
    if (!tasks.length) { skipped++; continue; }

    for (const task of tasks) {
      const now = new Date();
      const log = await db.collection("tenantInvoiceReminderLogs").updateOne(
        { reminderKey: task.reminderKey },
        { $setOnInsert: { reminderKey: task.reminderKey, invoiceId: invoice._id, landlordId: invoice.landlordId, tenantId: invoice.tenantId, type: task.kind, status: "processing", amountMinor: outstandingMinor, createdAt: now, updatedAt: now } },
        { upsert: true },
      );
      if (!log.upsertedCount) {
        const existing = await db.collection("tenantInvoiceReminderLogs").findOne({ reminderKey: task.reminderKey });
        if (existing?.status === "sent" || (existing?.status === "processing" && now.getTime() - new Date(existing.updatedAt || existing.createdAt).getTime() < 15 * 60_000)) { skipped++; continue; }
        const claimed = await db.collection("tenantInvoiceReminderLogs").updateOne(
          { reminderKey: task.reminderKey, status: { $in: ["failed", "processing"] } },
          { $set: { status: "processing", updatedAt: now, attempts: Number(existing?.attempts || 0) + 1 } },
        );
        if (!claimed.modifiedCount) { skipped++; continue; }
      }

      try {
        const tenant = ObjectId.isValid(String(invoice.tenantId)) ? await db.collection("tenants").findOne({ _id: new ObjectId(String(invoice.tenantId)) }) : null;
        const property = ObjectId.isValid(String(invoice.propertyId)) ? await db.collection("properties").findOne({ _id: new ObjectId(String(invoice.propertyId)) }) : null;
        if (!tenant?.email || !property) throw new Error("Tenant email or property information is unavailable");
        const currentInvoice = await db.collection("tenantInvoices").findOne({ _id: new ObjectId(String(invoice._id)) });
        if (!currentInvoice || !["issued", "partially_paid", "paid", "overdue"].includes(String(currentInvoice.status))) {
          await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey: task.reminderKey }, { $set: { status: "skipped_invoice_inactive", updatedAt: new Date() } });
          skipped++;
          continue;
        }
        const [latestInvoice] = await addInvoicePaymentStates(db, [currentInvoice]);
        const balanceMinor = Math.max(0, Number(latestInvoice?.balanceMinor) || 0);
        if (task.kind !== "payment_received" && balanceMinor <= 0) {
          await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey: task.reminderKey }, { $set: { status: "skipped_settled", amountMinor: 0, updatedAt: new Date() } });
          skipped++;
          continue;
        }
        if (task.kind !== "payment_received") {
          const invoiceDeliveryToday = await db.collection("tenantInvoiceDeliveries").findOne({
            invoiceId: String(invoice._id), channel: "email", status: "sent", sentAt: { $gte: todayStart, $lte: todayEnd },
          });
          if (invoiceDeliveryToday) {
            await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey: task.reminderKey }, { $set: { status: "skipped_invoice_delivery", updatedAt: new Date() } });
            skipped++;
            continue;
          }
        }
        if (task.kind === "payment_received" && !(latestInvoice?.paymentAllocations || []).some((row: any) => !row.reversal && row.paymentId && `${row.source === "wallet" ? "wallet" : "payment"}:${row.paymentId}` === task.reminderKey.split(":payment_received:")[1])) {
          await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey: task.reminderKey }, { $set: { status: "skipped_reversed", updatedAt: new Date() } });
          skipped++;
          continue;
        }

        const owner = ObjectId.isValid(String(invoice.landlordId)) ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(String(invoice.landlordId)) }) : null;
        const billingSettings = await db.collection("landlordBillingSettings").findOne({ landlordId: invoice.landlordId });
        let paymentInstructions: string | undefined;
        try {
          const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId: String(invoice.landlordId), propertyId: String(invoice.propertyId) });
          paymentInstructions = routing.paymentType === "bank" ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "contact your manager"}` : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${invoice.invoiceNumber}`;
        } catch { /* payment instructions are optional */ }
        const pdf = await generateTenantInvoicePdf({
          invoiceNumber: latestInvoice.invoiceNumber, issueDate: latestInvoice.issueDate, dueDate: latestInvoice.dueDate,
          billingPeriod: latestInvoice.billingPeriodLabel || latestInvoice.billingPeriod, status: latestInvoice.status,
          tenantName: tenant.name || latestInvoice.tenantName, tenantEmail: tenant.email, propertyName: property.name || latestInvoice.propertyName,
          propertyAddress: property.address, unitLabel: latestInvoice.unitLabel, items: latestInvoice.displayItems || latestInvoice.items,
          totalMinor: latestInvoice.totalMinor, originalInvoiceTotalMinor: latestInvoice.originalInvoiceTotalMinor,
          amountPaidMinor: latestInvoice.amountPaidMinor, balanceMinor, walletCreditAppliedMinor: latestInvoice.walletCreditAppliedMinor,
          reversedAmountMinor: latestInvoice.reversedAmountMinor, landlordName: owner?.name, landlordEmail: owner?.email,
          brandName: billingSettings?.invoiceBrandName, brandColor: billingSettings?.invoiceBrandColor, paymentInstructions,
        });
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
        const dueText = due?.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }) || "See invoice";
        const reminderType = task.kind === "payment_received" ? "paymentReceived" : Number(latestInvoice.amountPaidMinor) > 0 ? "partial" : task.kind === "before_due" ? "fiveDaysBefore" : task.kind === "overdue" ? "overdue" : "dueDate";
        await sendInvoiceEmail({ to: tenant.email, ownerName: tenant.name || "Tenant", propertyName: property.name || "Property", amount: balanceMinor / 100, dueDate: dueText, reminderType, dashboardUrl: `${baseUrl}/tenant-dashboard/invoices`, invoiceNumber: latestInvoice.invoiceNumber, pdfBytes: pdf.pdfBytes });
        await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey: task.reminderKey }, { $set: { status: "sent", amountMinor: balanceMinor, sentAt: new Date(), updatedAt: new Date() } });
        await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoice._id, landlordId: invoice.landlordId, tenantId: invoice.tenantId, event: task.kind === "payment_received" ? "payment_received_reminder_sent" : "reminder_sent", detail: { kind: task.kind, balanceMinor }, actorRole: "system", createdAt: new Date() });
        logger.info("Tenant invoice reminder sent", { invoiceId: String(invoice._id), tenantId: String(invoice.tenantId), kind: task.kind, balanceMinor });
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reminder send failed";
        await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey: task.reminderKey }, { $set: { status: "failed", error: message.slice(0, 500), updatedAt: new Date() } });
        logger.error("Tenant invoice reminder failed", { invoiceId: String(invoice._id), tenantId: String(invoice.tenantId), kind: task.kind, error: message });
        failed++;
      }
    }
  }
  return { sent, skipped, failed };
}

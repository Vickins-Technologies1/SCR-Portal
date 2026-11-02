import "server-only";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { addInvoicePaymentStates, getPriorInvoiceOutstandingMinor, invoiceItemsForDisplay } from "@/lib/tenant-invoices";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";
import { calculateTenantInvoiceDues } from "@/lib/tenant-invoice-dues";

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function sendTenantInvoiceReminders(today = new Date()) {
  const { db } = await connectToDatabase();
  await db.collection("tenantInvoiceReminderLogs").createIndex({ reminderKey: 1 }, { unique: true, name: "tenantInvoiceReminderLogs_key_unique" });
  const rows = await db.collection("tenantInvoices").find({ status: "issued" }).toArray();
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0 };
  const calculated = await addInvoicePaymentStates(db, rows);
  const settingsRows = await db.collection("landlordBillingSettings").find({ remindersEnabled: true }).toArray();
  const settings = new Map(settingsRows.map((row: any) => [String(row.landlordId), row]));
  let sent = 0, skipped = 0, failed = 0;
  const currentKey = dayKey(today);
  for (const invoice of calculated) {
    if (!invoice.balanceDue || invoice.balanceDue <= 0) { skipped++; continue; }
    const config: any = settings.get(invoice.landlordId);
    if (!config) { skipped++; continue; }
    const due = new Date(invoice.dueDate);
    const todayStart = new Date(`${currentKey}T00:00:00+03:00`);
    const dueStart = new Date(`${dayKey(due)}T00:00:00+03:00`);
    const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);
    let kind = "";
    if (Number(config.reminderBeforeDays) > 0 && diffDays === Number(config.reminderBeforeDays)) kind = "before_due";
    else if (config.reminderOnDueDate !== false && diffDays === 0) kind = "due_date";
    else if (diffDays < 0 && Math.abs(diffDays) % Math.max(1, Number(config.overdueReminderEveryDays) || 7) === 0) kind = "overdue";
    if (!kind) { skipped++; continue; }
    const reminderKey = `${invoice._id}:${kind}:${currentKey}`;
    const now = new Date();
    const log = await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey }, { $setOnInsert: { reminderKey, invoiceId: invoice._id, landlordId: invoice.landlordId, tenantId: invoice.tenantId, type: kind, status: "processing", amountMinor: Math.round(invoice.balanceDue * 100), createdAt: now, updatedAt: now } }, { upsert: true });
    if (!log.upsertedCount) {
      const existing = await db.collection("tenantInvoiceReminderLogs").findOne({ reminderKey });
      if (existing?.status === "sent" || (existing?.status === "processing" && now.getTime() - new Date(existing.updatedAt || existing.createdAt).getTime() < 15 * 60_000)) { skipped++; continue; }
      const claimed = await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey, status: { $in: ["failed", "processing"] } }, { $set: { status: "processing", updatedAt: now, attempts: Number(existing?.attempts || 0) + 1 } });
      if (!claimed.modifiedCount) { skipped++; continue; }
    }
    try {
      const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(invoice.tenantId) });
      const property = await db.collection("properties").findOne({ _id: new ObjectId(invoice.propertyId) });
      if (!tenant?.email || !property) throw new Error("Tenant email or property information is unavailable");
      const currentInvoice = await db.collection("tenantInvoices").findOne({ _id: invoice._id });
      if (!currentInvoice || currentInvoice.status !== "issued") {
        await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey }, { $set: { status: "skipped_invoice_inactive", updatedAt: new Date() } });
        skipped++;
        continue;
      }
      const [latestInvoice] = await addInvoicePaymentStates(db, [currentInvoice]);
      const currentDues = await calculateTenantInvoiceDues(db, tenant, property, today, { excludeInvoiceIds: [String(invoice._id)] });
      const currentOverdueMinor = currentDues.totalMinor;
      const reminderBalance = Math.min(Number(latestInvoice?.balanceMinor) || 0, currentOverdueMinor);
      if (reminderBalance <= 0) {
        await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey }, { $set: { status: "skipped_settled", updatedAt: new Date() } });
        skipped++;
        continue;
      }
      const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(invoice.landlordId) });
      const billingSettings = await db.collection("landlordBillingSettings").findOne({ landlordId: invoice.landlordId });
      const previousOutstandingMinor = await getPriorInvoiceOutstandingMinor(db, latestInvoice);
      let paymentInstructions: string | undefined;
      try {
        const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId: invoice.landlordId, propertyId: invoice.propertyId });
        paymentInstructions = routing.paymentType === "bank" ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "contact your manager"}` : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${invoice.invoiceNumber}`;
      } catch { /* payment settings are optional */ }
      const pdf = await generateTenantInvoicePdf({ invoiceNumber: latestInvoice.invoiceNumber, issueDate: latestInvoice.issueDate, dueDate: latestInvoice.dueDate, billingPeriod: latestInvoice.billingPeriodLabel || latestInvoice.billingPeriod, status: latestInvoice.status, tenantName: tenant.name, tenantEmail: tenant.email, propertyName: property.name, propertyAddress: property.address, unitLabel: latestInvoice.unitLabel, items: invoiceItemsForDisplay(latestInvoice), totalMinor: latestInvoice.totalMinor, amountPaidMinor: latestInvoice.amountPaidMinor, previousOutstandingMinor, creditsAndAdjustmentsMinor: (latestInvoice.adjustments || []).reduce((sum: number, row: any) => sum + Number(row.amountMinor || 0), 0), landlordName: owner?.name, landlordEmail: owner?.email, landlordPhone: owner?.phone, brandName: billingSettings?.invoiceBrandName, brandColor: billingSettings?.invoiceBrandColor, paymentInstructions });
      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
      const dueText = due.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });
      await sendInvoiceEmail({ to: tenant.email, ownerName: tenant.name || "Tenant", propertyName: property.name || "Property", amount: reminderBalance / 100, dueDate: dueText, reminderType: kind === "before_due" ? "fiveDaysBefore" : kind === "overdue" ? "overdue" : "dueDate", dashboardUrl: `${baseUrl}/tenant-dashboard/invoices`, invoiceNumber: latestInvoice.invoiceNumber, pdfBytes: pdf.pdfBytes });
      await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey }, { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() } });
      await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoice._id, landlordId: invoice.landlordId, tenantId: invoice.tenantId, event: "reminder_sent", detail: { kind, balanceMinor: reminderBalance }, actorRole: "system", createdAt: new Date() });
      sent++;
    } catch (error) {
      await db.collection("tenantInvoiceReminderLogs").updateOne({ reminderKey }, { $set: { status: "failed", error: error instanceof Error ? error.message : "Reminder send failed", updatedAt: new Date() } });
      failed++;
    }
  }
  return { sent, skipped, failed };
}

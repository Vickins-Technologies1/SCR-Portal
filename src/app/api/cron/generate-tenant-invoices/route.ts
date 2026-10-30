import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { withCronJobLock } from "@/lib/cron-lock";
import { identityValues } from "@/lib/payment-query";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";

const dateParts = () => {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => Number(values.find((value) => value.type === type)?.value || 0);
  return { year: part("year"), month: part("month"), day: part("day") };
};

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  try {
    const { db } = await connectToDatabase();
    const run = await withCronJobLock(db, "generate-tenant-invoices", async () => {
      await db.collection("tenantInvoices").createIndexes([
        { key: { tenancyId: 1, billingPeriod: 1 }, name: "tenantInvoices_tenancy_period_unique", unique: true },
        { key: { invoiceNumber: 1 }, name: "tenantInvoices_invoiceNumber_unique", unique: true },
      ]);
      const today = dateParts();
      const period = `${today.year}-${String(today.month).padStart(2, "0")}`;
      const settings = await db.collection("landlordBillingSettings").find({ invoicingEnabled: true, automaticGeneration: true }).toArray();
      let created = 0, duplicated = 0, issued = 0, sent = 0, sendFailed = 0, skipped = 0;
      for (const setting of settings) {
        // Catch up if a daily cron run missed the configured day; uniqueness
        // makes subsequent runs idempotent for the same billing period.
        const isGenerationDay = Number(setting.generationDay) <= today.day;
        const landlordId = String(setting.landlordId || "");
        if (!ObjectId.isValid(landlordId)) { skipped++; continue; }
        const eligiblePropertyIds = Array.isArray(setting.eligiblePropertyIds) ? setting.eligiblePropertyIds.filter((id: unknown) => typeof id === "string" && ObjectId.isValid(id)) : [];
        const properties = await db.collection("properties").find({ ownerId: { $in: identityValues(landlordId) }, ...(eligiblePropertyIds.length ? { _id: { $in: eligiblePropertyIds.map((id: string) => new ObjectId(id)) } } : {}) }).toArray();
        const propertyIds = properties.map((property: any) => property._id.toString());
        if (!propertyIds.length) continue;
        const excluded = new Set((Array.isArray(setting.excludedTenantIds) ? setting.excludedTenantIds : []).map(String));
        const eligibleTenantIds = new Set((Array.isArray(setting.eligibleTenantIds) ? setting.eligibleTenantIds : []).map(String));
        const tenants = await db.collection("tenants").find({ propertyId: { $in: identityValues(propertyIds) }, invoiceEnabled: { $ne: false }, status: { $nin: ["inactive", "vacated"] } }).toArray();
        for (const tenant of tenants) {
          if (excluded.has(tenant._id.toString())) continue;
          if (eligibleTenantIds.size && !eligibleTenantIds.has(tenant._id.toString())) continue;
          const existingOnRetryDay = !isGenerationDay ? await db.collection("tenantInvoices").findOne({ tenancyId: tenant._id.toString(), billingPeriod: period }) : null;
          if (!isGenerationDay && !existingOnRetryDay) continue;
          const property = properties.find((item: any) => item._id.toString() === String(tenant.propertyId));
          const rentMinor = Math.round(Number(tenant.price || 0) * 100);
          if (!property || !Number.isSafeInteger(rentMinor) || rentMinor <= 0) { skipped++; continue; }
          const start = new Date(Date.UTC(today.year, today.month - 1, 1));
          const end = new Date(Date.UTC(today.year, today.month, 0, 23, 59, 59, 999));
          const leaseStart = tenant.leaseStartDate ? new Date(tenant.leaseStartDate) : null;
          const leaseEnd = tenant.leaseEndDate ? new Date(tenant.leaseEndDate) : null;
          if ((leaseStart && !Number.isNaN(leaseStart.getTime()) && leaseStart > end) || (leaseEnd && !Number.isNaN(leaseEnd.getTime()) && leaseEnd < start)) { skipped++; continue; }
          const day = Math.min(28, Math.max(1, Number(setting.defaultDueDay) || Number(property.rentPaymentDate) || 5));
          const invoiceId = new ObjectId();
          const invoiceNumber = `DRAFT-${invoiceId.toString().toUpperCase()}`;
          const items: Array<{ description: string; quantity: number; unitAmount: number; amount: number; category: string }> = [{ description: `Monthly rent — ${period}`, quantity: 1, unitAmount: rentMinor, amount: rentMinor, category: "rent" }];
          const utilityCharges = await db.collection("utilityCharges").find({ tenantId: tenant._id.toString(), propertyId: property._id.toString(), billingPeriod: period, status: "posted" }).toArray();
          for (const charge of utilityCharges) {
            const utilityMinor = Math.round(Number(charge.amount || 0) * 100);
            if (Number.isSafeInteger(utilityMinor) && utilityMinor > 0) items.push({ description: `${String(charge.utilityName || "Utility")} — ${period}`, quantity: 1, unitAmount: utilityMinor, amount: utilityMinor, category: "utilities" });
          }
          const doc = {
            _id: invoiceId, landlordId, tenantId: tenant._id.toString(), tenancyId: tenant._id.toString(), propertyId: property._id.toString(),
            unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"), tenantName: String(tenant.name || "Tenant"),
            propertyName: String(property.name || "Property"), billingPeriod: period, invoiceNumber, issueDate: null,
            dueDate: new Date(Date.UTC(today.year, today.month - 1, day)), items,
            totalMinor: items.reduce((sum, item) => sum + item.amount, 0), status: "draft", createdAt: new Date(), updatedAt: new Date(),
          };
          let currentInvoice: any = existingOnRetryDay;
          if (isGenerationDay) {
            let inserted = false;
            try {
              const result = await db.collection("tenantInvoices").updateOne({ tenancyId: doc.tenancyId, billingPeriod: period }, { $setOnInsert: doc }, { upsert: true });
              inserted = !!result.upsertedCount;
            } catch (error: any) { if (error?.code === 11000) { duplicated++; continue; } throw error; }
            currentInvoice = inserted ? doc : await db.collection("tenantInvoices").findOne({ tenancyId: doc.tenancyId, billingPeriod: period });
            if (!inserted) duplicated++;
            else {
              created++;
              await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoiceId.toString(), landlordId, tenantId: doc.tenantId, event: "automatic_draft_created", actorRole: "system", createdAt: new Date() });
            }
          }
          if (isGenerationDay && currentInvoice && currentInvoice.status === "draft" && setting.automaticIssuing === true && setting.manualApproval !== true) {
            const now = new Date();
            const prefix = String(setting.invoicePrefix || "R").replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 21) || "R";
            const finalNumber = `${prefix}-${period.replace("-", "")}-${currentInvoice._id.toString().toUpperCase()}`;
            const update = await db.collection("tenantInvoices").updateOne({ _id: currentInvoice._id, status: "draft" }, { $set: { status: "issued", invoiceNumber: finalNumber, issueDate: now, issuedBy: "system", updatedAt: now } });
            if (update.modifiedCount) {
              issued++;
              await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: currentInvoice._id.toString(), landlordId, tenantId: doc.tenantId, event: "automatically_issued", actorRole: "system", createdAt: now });
            }
          }
          if (currentInvoice && (currentInvoice.status === "issued" || isGenerationDay && setting.automaticIssuing === true && setting.manualApproval !== true) && setting.automaticSending === true) {
                const activeInvoice = await db.collection("tenantInvoices").findOne({ _id: currentInvoice._id });
                if (!activeInvoice || activeInvoice.status !== "issued") continue;
                const alreadySent = await db.collection("tenantInvoiceDeliveries").findOne({ invoiceId: currentInvoice._id.toString(), channel: "email", status: "sent" });
                if (alreadySent) continue;
                const latestAttempt = await db.collection("tenantInvoiceDeliveries").findOne({ invoiceId: currentInvoice._id.toString(), channel: "email" }, { sort: { createdAt: -1 } });
                if (latestAttempt?.status === "queued" && Date.now() - new Date(latestAttempt.createdAt).getTime() < 15 * 60_000) continue;
                const finalNumber = activeInvoice.invoiceNumber;
                const tenantEmail = String(tenant.email || "").trim();
                const attempt = await db.collection("tenantInvoiceDeliveries").countDocuments({ invoiceId: currentInvoice._id.toString(), channel: "email" }) + 1;
                const log = await db.collection("tenantInvoiceDeliveries").insertOne({ invoiceId: currentInvoice._id.toString(), landlordId, tenantId: doc.tenantId, channel: "email", status: "queued", attempts: attempt, createdAt: new Date(), updatedAt: new Date() });
                try {
                  if (!tenantEmail) throw new Error("Tenant email is missing");
                  let paymentInstructions: string | undefined;
                  try {
                    const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId, propertyId: property._id.toString() });
                    paymentInstructions = routing.paymentType === "bank" ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "contact your manager"}` : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${finalNumber}`;
                  } catch { /* leave payment details out when not configured */ }
                  const pdf = await generateTenantInvoicePdf({ invoiceNumber: finalNumber, issueDate: activeInvoice.issueDate, dueDate: activeInvoice.dueDate, billingPeriod: period, status: activeInvoice.status, tenantName: doc.tenantName, tenantEmail, propertyName: doc.propertyName, propertyAddress: property.address, unitLabel: doc.unitLabel, items: activeInvoice.items, totalMinor: activeInvoice.totalMinor, brandName: setting.invoiceBrandName, brandColor: setting.invoiceBrandColor, paymentInstructions });
                  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
                  await sendInvoiceEmail({ to: tenantEmail, ownerName: doc.tenantName, propertyName: doc.propertyName, amount: activeInvoice.totalMinor / 100, dueDate: new Date(activeInvoice.dueDate).toLocaleDateString("en-KE"), reminderType: "manual", dashboardUrl: `${baseUrl}/tenant-dashboard/invoices`, invoiceNumber: finalNumber, pdfBytes: pdf.pdfBytes });
                  await db.collection("tenantInvoiceDeliveries").updateOne({ _id: log.insertedId }, { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() } });
                  await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: currentInvoice._id.toString(), landlordId, tenantId: doc.tenantId, event: "automatic_delivery_sent", channel: "email", actorRole: "system", createdAt: new Date() });
                  sent++;
                } catch (error) {
                  await db.collection("tenantInvoiceDeliveries").updateOne({ _id: log.insertedId }, { $set: { status: "failed", error: error instanceof Error ? error.message : "Email failed", updatedAt: new Date() } });
                  await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: currentInvoice._id.toString(), landlordId, tenantId: doc.tenantId, event: "automatic_delivery_failed", channel: "email", actorRole: "system", createdAt: new Date() });
                  sendFailed++;
                }
          }
        }
      }
      return { period, landlords: settings.length, created, duplicated, issued, sent, sendFailed, skipped };
    });
    if (!run.acquired) return NextResponse.json({ success: true, skipped: true, reason: "already_running" });
    return NextResponse.json({ success: true, ...run.result });
  } catch (error) {
    console.error("Tenant invoice generation cron failed", error);
    return NextResponse.json({ success: false, message: "Tenant invoice generation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

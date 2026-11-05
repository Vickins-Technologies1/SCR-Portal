import "server-only";
import { Db, ObjectId } from "mongodb";
import { identityValues } from "@/lib/payment-query";
import { businessDateKey, businessDateParts, businessDateTime, businessDayEnd, businessDueDate } from "@/lib/business-time";
import { calculateTenantInvoiceDues } from "@/lib/tenant-invoice-dues";
import { addInvoicePaymentStates, recordTenantInvoiceCharges } from "@/lib/tenant-invoices";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";
import logger from "@/lib/logger";

type BillingSetting = {
  landlordId: string;
  eligiblePropertyIds?: string[];
  eligibleTenantIds?: string[];
  excludedTenantIds?: string[];
  defaultDueDay?: number;
  invoicePrefix?: string;
  invoiceBrandName?: string;
  invoiceBrandColor?: string;
};

function businessDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = businessDateParts(parsed);
  return businessDateTime(parts);
}

function rentDueDateForTenant(tenant: any, property: any, setting: BillingSetting, today: Date) {
  const leaseStart = businessDate(tenant.leaseStartDate);
  const paymentDay = Math.max(1, Math.trunc(
    Number(property.rentPaymentDate) ||
    (leaseStart ? businessDateParts(leaseStart).day : 0) ||
    Number(setting.defaultDueDay) ||
    1,
  ));
  const todayParts = businessDateParts(today);
  let dueDate = businessDueDate(todayParts.year, todayParts.month - 1, paymentDay);
  if (leaseStart && businessDateKey(dueDate) < businessDateKey(leaseStart)) {
    dueDate = businessDueDate(todayParts.year, todayParts.month, paymentDay);
  }
  const leaseEnd = businessDate(tenant.leaseEndDate);
  if (leaseEnd && businessDateKey(dueDate) > businessDateKey(leaseEnd)) return null;
  return dueDate;
}

function dayParts(value: Date) {
  const parts = businessDateParts(value);
  return { ...parts, key: businessDateKey(value) };
}

function daysBetweenBusinessDates(start: Date, end: Date) {
  const startParts = businessDateParts(start);
  const endParts = businessDateParts(end);
  const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export async function sendOverdueTenantInvoicesOnRentDueDate(db: Db, now = new Date()) {
  await db.collection("tenantInvoices").createIndexes([
    { key: { tenancyId: 1, billingPeriod: 1 }, name: "tenantInvoices_tenancy_period_unique", unique: true },
    { key: { invoiceNumber: 1 }, name: "tenantInvoices_invoiceNumber_unique", unique: true },
  ]);

  const today = dayParts(now);
  const period = `${today.year}-${String(today.month).padStart(2, "0")}`;
  const settings = await db.collection<BillingSetting>("landlordBillingSettings")
    .find({ invoicingEnabled: true })
    .toArray();
  let created = 0;
  let issued = 0;
  let sent = 0;
  let sendFailed = 0;
  let generationFailed = 0;
  let skipped = 0;

  for (const setting of settings) {
    const landlordId = String(setting.landlordId || "");
    if (!ObjectId.isValid(landlordId)) { skipped++; continue; }
    const eligiblePropertyIds = Array.isArray(setting.eligiblePropertyIds)
      ? setting.eligiblePropertyIds.filter((id): id is string => typeof id === "string" && ObjectId.isValid(id))
      : [];
    const properties = await db.collection("properties").find({
      ownerId: { $in: identityValues(landlordId) },
      ...(eligiblePropertyIds.length ? { _id: { $in: eligiblePropertyIds.map((id) => new ObjectId(id)) } } : {}),
    }).toArray();
    const propertyIds = properties.map((property: any) => String(property._id));
    if (!propertyIds.length) continue;

    const excludedTenantIds = new Set((setting.excludedTenantIds || []).map(String));
    const eligibleTenantIds = new Set((setting.eligibleTenantIds || []).map(String));
    const tenants = await db.collection("tenants").find({
      propertyId: { $in: identityValues(propertyIds) },
      invoiceEnabled: { $ne: false },
      status: { $nin: ["inactive", "vacated"] },
    }).toArray();

    for (const tenant of tenants) {
      const tenantId = String(tenant._id);
      const failureKey = `${landlordId}:${tenantId}:${period}`;
      try {
      if (excludedTenantIds.has(tenantId) || (eligibleTenantIds.size && !eligibleTenantIds.has(tenantId))) continue;
      const property = properties.find((item: any) => String(item._id) === String(tenant.propertyId));
      if (!property) { skipped++; continue; }

      const dueDate = rentDueDateForTenant(tenant, property, setting, now);
      if (!dueDate) continue;
      const invoiceDueDate = businessDayEnd(dueDate);

      const billingPeriod = period;
      const invoiceFilter = { tenancyId: tenantId, billingPeriod };
      let invoice: any = await db.collection("tenantInvoices").findOne(invoiceFilter);
      const daysAfterRentDue = daysBetweenBusinessDates(dueDate, now);
      if (daysAfterRentDue < 0) continue;

      if (invoice && invoice.invoiceBasis !== "overdue_tenant_dues_v1") {
        skipped++;
        continue;
      }

      if (!invoice || invoice.status === "draft") {
        const dues = await calculateTenantInvoiceDues(db, tenant, property, now);
        if (dues.totalMinor <= 0) { skipped++; continue; }
        const invoiceId = invoice?._id || new ObjectId();
        const invoiceNumber = invoice?.invoiceNumber || `DRAFT-${invoiceId.toString().toUpperCase()}`;
        const draft = {
          _id: invoiceId,
          landlordId,
          tenantId,
          tenancyId: tenantId,
          propertyId: String(property._id),
          unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"),
          tenantName: String(tenant.name || "Tenant"),
          propertyName: String(property.name || "Property"),
          billingPeriod,
          invoiceNumber,
          issueDate: null,
          dueDate: invoiceDueDate,
          items: dues.lines,
          totalMinor: dues.totalMinor,
          status: "draft",
          invoiceBasis: "overdue_tenant_dues_v1",
          obligationRefs: dues.lines.map((line) => line.obligationRef),
          obligationInvoiceIds: dues.existingInvoiceIds,
          createdAt: invoice?.createdAt || now,
          updatedAt: now,
        };

        if (invoice) {
          await db.collection("tenantInvoices").updateOne(
            { _id: invoice._id, status: "draft" },
            { $set: {
              dueDate: draft.dueDate,
              items: draft.items,
              totalMinor: draft.totalMinor,
              obligationRefs: draft.obligationRefs,
              obligationInvoiceIds: draft.obligationInvoiceIds,
              updatedAt: now,
            } },
          );
          invoice = await db.collection("tenantInvoices").findOne({ _id: invoice._id });
        } else {
          try {
            const result = await db.collection("tenantInvoices").updateOne(invoiceFilter, { $setOnInsert: draft }, { upsert: true });
            if (result.upsertedCount) {
              invoice = draft;
              created++;
              logger.info("Tenant invoice generated", { landlordId, tenantId, invoiceId: invoiceId.toString(), period, totalMinor: draft.totalMinor });
              await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoiceId.toString(), landlordId, tenantId, event: "automatic_draft_created", actorRole: "system", createdAt: now });
            } else {
              invoice = await db.collection("tenantInvoices").findOne(invoiceFilter);
            }
          } catch (error: any) {
            if (error?.code === 11000) invoice = await db.collection("tenantInvoices").findOne(invoiceFilter);
            else throw error;
          }
        }
      }

      if (!invoice || !["draft", "issued"].includes(String(invoice.status))) { skipped++; continue; }
      if (invoice.status === "draft") {
        const prefix = String(setting.invoicePrefix || "R").replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 21) || "R";
        const invoiceNumber = `${prefix}-${period.replace("-", "")}-${invoice._id.toString().toUpperCase()}`;
        const update = await db.collection("tenantInvoices").updateOne(
          { _id: invoice._id, status: "draft" },
          { $set: { status: "issued", invoiceNumber, issueDate: now, issuedBy: "system", dueDate: invoiceDueDate, updatedAt: now } },
        );
        if (update.modifiedCount) {
          issued++;
          await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoice._id.toString(), landlordId, tenantId, event: "automatically_issued_on_rent_due_date", actorRole: "system", createdAt: now });
        }
        invoice = await db.collection("tenantInvoices").findOne({ _id: invoice._id });
      }
      if (!invoice || invoice.status !== "issued") { skipped++; continue; }
      await recordTenantInvoiceCharges(db, invoice);
      await db.collection("tenantInvoiceAutomationFailures").updateOne(
        { failureKey, status: "failed" }, { $set: { status: "recovered", resolvedAt: new Date(), updatedAt: new Date() } },
      );

      const invoiceId = invoice._id.toString();
      const alreadySent = await db.collection("tenantInvoiceDeliveries").findOne({ invoiceId, channel: "email", status: "sent" });
      if (alreadySent) { skipped++; continue; }
      const latestAttempt = await db.collection("tenantInvoiceDeliveries").findOne({ invoiceId, channel: "email" }, { sort: { createdAt: -1 } });
      if (latestAttempt?.status === "queued" && now.getTime() - new Date(latestAttempt.createdAt).getTime() < 15 * 60_000) { skipped++; continue; }
      if (latestAttempt?.status === "skipped_settled") { skipped++; continue; }

      const tenantEmail = String(tenant.email || "").trim();
      const attempt = await db.collection("tenantInvoiceDeliveries").countDocuments({ invoiceId, channel: "email" }) + 1;
      const delivery = await db.collection("tenantInvoiceDeliveries").insertOne({ invoiceId, landlordId, tenantId, channel: "email", status: "queued", attempts: attempt, actorRole: "system", createdAt: now, updatedAt: now });
      try {
        if (!tenantEmail) throw new Error("Tenant email is missing");
        const [calculatedInvoice] = await addInvoicePaymentStates(db, [invoice]);
        if (!calculatedInvoice || Number(calculatedInvoice.balanceMinor) <= 0) {
          await db.collection("tenantInvoiceDeliveries").updateOne({ _id: delivery.insertedId }, { $set: { status: "skipped_settled", updatedAt: new Date() } });
          skipped++;
          continue;
        }
        invoice = calculatedInvoice;
        const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(landlordId) });
        let paymentInstructions: string | undefined;
        try {
          const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId, propertyId: String(property._id) });
          paymentInstructions = routing.paymentType === "bank"
            ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "contact your manager"}`
            : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${invoice.invoiceNumber}`;
        } catch { /* payment instructions are optional */ }
        const pdf = await generateTenantInvoicePdf({
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          billingPeriod: invoice.billingPeriodLabel || invoice.billingPeriod,
          status: invoice.status,
          tenantName: tenant.name || invoice.tenantName,
          tenantEmail,
          propertyName: property.name || invoice.propertyName,
          propertyAddress: property.address,
          unitLabel: invoice.unitLabel,
          items: invoice.displayItems || invoice.items,
          totalMinor: invoice.totalMinor,
          amountPaidMinor: invoice.amountPaidMinor,
          originalInvoiceTotalMinor: invoice.originalInvoiceTotalMinor,
          balanceMinor: invoice.balanceMinor,
          walletCreditAppliedMinor: invoice.walletCreditAppliedMinor,
          reversedAmountMinor: invoice.reversedAmountMinor,
          landlordName: owner?.name,
          landlordEmail: owner?.email,
          brandName: setting.invoiceBrandName,
          brandColor: setting.invoiceBrandColor,
          paymentInstructions,
        });
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
        await sendInvoiceEmail({
          to: tenantEmail,
          ownerName: tenant.name || "Tenant",
          propertyName: property.name || "Property",
          amount: Number(invoice.balanceMinor || 0) / 100,
          dueDate: new Date(invoice.dueDate).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }),
          reminderType: "manual",
          dashboardUrl: `${baseUrl}/tenant-dashboard/invoices`,
          invoiceNumber: invoice.invoiceNumber,
          pdfBytes: pdf.pdfBytes,
        });
        await db.collection("tenantInvoiceDeliveries").updateOne({ _id: delivery.insertedId }, { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() } });
        await db.collection("tenantInvoiceActivity").insertOne({ invoiceId, landlordId, tenantId, event: "automatic_delivery_sent_on_rent_due_date", channel: "email", actorRole: "system", createdAt: new Date() });
        sent++;
        logger.info("Tenant invoice sent", { landlordId, tenantId, invoiceId, channel: "email", balanceMinor: invoice.balanceMinor });
      } catch (error) {
        await db.collection("tenantInvoiceDeliveries").updateOne({ _id: delivery.insertedId }, { $set: { status: "failed", error: error instanceof Error ? error.message : "Invoice email failed", updatedAt: new Date() } });
        await db.collection("tenantInvoiceActivity").insertOne({ invoiceId, landlordId, tenantId, event: "automatic_delivery_failed", channel: "email", actorRole: "system", createdAt: new Date() });
        sendFailed++;
      }
      } catch (error) {
        generationFailed++;
        const message = error instanceof Error ? error.message : "Automatic invoice generation failed";
        try {
          await db.collection("tenantInvoiceAutomationFailures").updateOne(
            { failureKey },
            { $set: { failureKey, landlordId, tenantId, propertyId: String(tenant.propertyId || ""), period, status: "failed", error: message.slice(0, 500), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true },
          );
        } catch (writeError) {
          logger.error("Could not persist tenant invoice generation failure", { landlordId, tenantId, period, error: writeError instanceof Error ? writeError.message : "Database write failed" });
        }
        logger.error("Tenant invoice generation failed", { landlordId, tenantId, period, error: message });
      }
    }
  }

  return { period, landlords: settings.length, created, issued, sent, sendFailed, generationFailed, skipped };
}

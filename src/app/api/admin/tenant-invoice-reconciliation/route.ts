import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { addInvoicePaymentStates } from "@/lib/tenant-invoices";
import { isAutomaticTenantDuesInvoice } from "@/lib/tenant-invoice-ledger";
import { calculateTenantInvoiceDues } from "@/lib/tenant-invoice-dues";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";

const migrationKey = "tenant-dues-invoicing-v2";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function analyze(db: any) {
  const rows = await db.collection("tenantInvoices").find({}).sort({ tenantId: 1, billingPeriod: 1, _id: 1 }).toArray();
  const states = await addInvoicePaymentStates(db, rows.filter((row: any) => !["draft", "cancelled", "voided", "superseded"].includes(row.status)));
  const stateById = new Map(states.map((row: any) => [String(row._id), row]));
  const duplicateRefs = new Map<string, string[]>();
  for (const row of rows) for (const ref of row.obligationRefs || []) duplicateRefs.set(String(ref), [...(duplicateRefs.get(String(ref)) || []), String(row._id)]);
  const duplicateInvoiceIds = new Set([...duplicateRefs.values()].filter((ids) => ids.length > 1).flat());
  const items: Array<any> = [];
  for (const invoice of rows) {
    let classification = "valid_outstanding";
    const current = stateById.get(String(invoice._id));
    if (invoice.status === "cancelled") classification = "cancelled";
    else if (["voided", "superseded"].includes(invoice.status)) classification = String(invoice.status);
    else if (Number(current?.balanceMinor || 0) <= 0 && invoice.status !== "draft") classification = "fully_settled";
    else if (duplicateInvoiceIds.has(String(invoice._id))) classification = "duplicate_obligation_reference";
    else {
      const tenantId = String(invoice.tenantId || ""), propertyId = String(invoice.propertyId || "");
      const tenant = ObjectId.isValid(tenantId) ? await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) }) : null;
      const property = ObjectId.isValid(propertyId) ? await db.collection("properties").findOne({ _id: new ObjectId(propertyId) }) : null;
      if (!tenant || !property) classification = "needs_manual_review_missing_relationship";
      else {
        const legacyAuto = isAutomaticTenantDuesInvoice(invoice);
        if (!legacyAuto) { classification = invoice.status === "draft" ? "draft_requires_review" : "valid_outstanding"; }
        else {
        const dues = await calculateTenantInvoiceDues(db, tenant, property, new Date(), { excludeInvoiceIds: [String(invoice._id)] });
        const balance = Number(invoice.status === "draft" ? invoice.totalMinor : current?.balanceMinor || invoice.totalMinor || 0);
        if (invoice.status === "draft") classification = dues.totalMinor === balance ? "valid_draft" : "obsolete_draft_candidate";
        else if (dues.totalMinor === 0 || balance > dues.totalMinor) classification = "issued_inconsistent_overstated";
        else if (balance < dues.totalMinor) classification = "issued_inconsistent_understated";
        else classification = "valid_outstanding";
        }
      }
    }
    const linkedPayments = await db.collection("payments").countDocuments({ invoiceId: { $in: [String(invoice._id), invoice._id] } });
    const deliveries = await db.collection("tenantInvoiceDeliveries").countDocuments({ invoiceId: String(invoice._id) });
    items.push({ invoiceId: String(invoice._id), invoiceNumber: invoice.invoiceNumber || "", tenantId: String(invoice.tenantId || ""), landlordId: String(invoice.landlordId || ""), propertyId: String(invoice.propertyId || ""), status: invoice.status, totalMinor: Number(invoice.totalMinor || 0), amountPaidMinor: Number(current?.amountPaidMinor || 0), balanceMinor: Number(current?.balanceMinor ?? invoice.totalMinor ?? 0), linkedPayments, deliveries, classification });
  }
  const preview = { migrationKey, generatedAt: new Date().toISOString(), totals: Object.fromEntries([...new Set(items.map((row) => row.classification))].map((kind) => [kind, items.filter((row) => row.classification === kind).length])), items };
  return { preview, previewHash: hash(items.map(({ invoiceId, classification, totalMinor, amountPaidMinor, balanceMinor, linkedPayments, deliveries }) => ({ invoiceId, classification, totalMinor, amountPaidMinor, balanceMinor, linkedPayments, deliveries }))) };
}

export async function POST(request: NextRequest) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const auth = await requireAdmin(request, "admin:payments:manage");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || !["analyze", "execute"].includes(body.mode)) return NextResponse.json({ success: false, message: "mode must be analyze or execute" }, { status: 400 });
  const { db } = await connectToDatabase();
  await db.collection("tenantInvoiceReconciliationRuns").createIndex({ migrationKey: 1, mode: 1, previewHash: 1 }, { unique: true, partialFilterExpression: { mode: "execution" }, name: "tenant_invoice_migration_key_mode_hash_unique" });
  const current = await analyze(db);
  if (body.mode === "analyze") {
    await db.collection("tenantInvoiceReconciliationRuns").insertOne({ migrationKey, mode: "analysis", previewHash: current.previewHash, report: current.preview, actorId: auth.userId, actorRole: auth.role, createdAt: new Date() });
    return NextResponse.json({ success: true, ...current });
  }
  if (body.approve !== true || typeof body.previewHash !== "string" || body.previewHash !== current.previewHash) return NextResponse.json({ success: false, message: "Execution requires explicit approval of the current analysis. Re-run analysis after any data change.", currentPreviewHash: current.previewHash }, { status: 409 });
  const prior = await db.collection("tenantInvoiceReconciliationRuns").findOne({ migrationKey, mode: "execution", previewHash: current.previewHash, status: "completed" });
  if (prior) return NextResponse.json({ success: true, alreadyExecuted: true, report: prior.report });
  let run: any;
  try {
    run = await db.collection("tenantInvoiceReconciliationRuns").findOneAndUpdate(
      { migrationKey, mode: "execution", previewHash: current.previewHash, $or: [{ status: { $exists: false } }, { status: { $in: ["failed"] } }] },
      { $set: { status: "running", actorId: auth.userId, actorRole: auth.role, startedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ success: false, message: "This reconciliation is already running" }, { status: 409 });
    throw error;
  }
  const runDoc = (run as any)?.value ?? run;
  if (!runDoc) return NextResponse.json({ success: false, message: "This reconciliation is already running" }, { status: 409 });
  let archivedDrafts = 0, supersededIssued = 0, preservedPaymentHistory = 0, manualReview = 0, regenerated = 0, skippedUpToDate = 0, emailSent = 0, emailFailed = 0;
  const affectedTenantIds = new Set<string>();
  try {
    for (const item of current.preview.items) {
      if (item.classification === "obsolete_draft_candidate") {
        if (item.linkedPayments || item.deliveries) {
          manualReview++;
          await db.collection("tenantInvoices").updateOne({ _id: new ObjectId(item.invoiceId), status: "draft" }, { $set: { reconciliationReviewRequired: true, reconciliationReviewReason: "Draft has payment or delivery history", reconciliationMigrationKey: migrationKey } });
          continue;
        }
        const result = await db.collection("tenantInvoices").updateOne({ _id: new ObjectId(item.invoiceId), status: "draft" }, { $set: { status: "voided", voidReason: "Obsolete pre dues based generation draft", voidedAt: new Date(), voidedBy: auth.userId, reconciliationMigrationKey: migrationKey } });
        if (result.modifiedCount) {
          archivedDrafts++;
          affectedTenantIds.add(item.tenantId);
          await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: item.invoiceId, landlordId: item.landlordId, tenantId: item.tenantId, event: "migration_draft_archived", actorId: auth.userId, actorRole: auth.role, detail: { reason: "obsolete_draft_candidate", migrationKey }, createdAt: new Date() });
        }
      } else if (String(item.classification).startsWith("issued_inconsistent") || item.classification === "duplicate_obligation_reference") {
        if (item.linkedPayments || item.amountPaidMinor > 0) {
          preservedPaymentHistory++; manualReview++;
          await db.collection("tenantInvoices").updateOne({ _id: new ObjectId(item.invoiceId), status: { $in: ["issued", "overdue", "partially_paid"] } }, { $set: { reconciliationReviewRequired: true, reconciliationReviewReason: "Issued invoice has payment history; preserve for manual obligation relinking", reconciliationMigrationKey: migrationKey } });
          continue;
        }
        const result = await db.collection("tenantInvoices").updateOne({ _id: new ObjectId(item.invoiceId), status: { $in: ["issued", "overdue", "partially_paid"] } }, { $set: { status: "superseded", supersededAt: new Date(), supersededBy: auth.userId, supersededReason: String(item.classification), reconciliationMigrationKey: migrationKey } });
        if (result.modifiedCount) {
          supersededIssued++;
          affectedTenantIds.add(item.tenantId);
          await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: item.invoiceId, landlordId: item.landlordId, tenantId: item.tenantId, event: "migration_invoice_superseded", actorId: auth.userId, actorRole: auth.role, detail: { reason: item.classification, migrationKey }, createdAt: new Date() });
        }
      }
    }
    for (const tenantId of affectedTenantIds) {
      if (!ObjectId.isValid(tenantId)) { manualReview++; continue; }
      const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
      const propertyId = String(tenant?.propertyId || "");
      const property = ObjectId.isValid(propertyId) ? await db.collection("properties").findOne({ _id: new ObjectId(propertyId) }) : null;
      if (!tenant || !property || tenant.invoiceEnabled === false || ["inactive", "vacated"].includes(String(tenant.status))) { skippedUpToDate++; continue; }
      const dues = await calculateTenantInvoiceDues(db, tenant, property);
      if (dues.totalMinor <= 0) { skippedUpToDate++; continue; }
      const billingPeriod = `RECON-${migrationKey}`;
      const existing = await db.collection("tenantInvoices").findOne({ tenancyId: tenantId, billingPeriod });
      if (existing) continue;
      const settings = await db.collection("landlordBillingSettings").findOne({ landlordId: String(property.ownerId) });
      const invoiceId = new ObjectId();
      const now = new Date();
      const dueDate = dues.lines.reduce((earliest, line) => line.dueDate < earliest ? line.dueDate : earliest, dues.lines[0].dueDate);
      const autoIssue = settings?.automaticIssuing === true && settings?.manualApproval !== true;
      const prefix = String(settings?.invoicePrefix || "R").replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 21) || "R";
      const invoiceNumber = autoIssue ? `${prefix}-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${invoiceId.toString().toUpperCase()}` : `DRAFT-${invoiceId.toString().toUpperCase()}`;
      const doc = { _id: invoiceId, landlordId: String(property.ownerId), tenantId, tenancyId: tenantId, propertyId, unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"), tenantName: String(tenant.name || "Tenant"), propertyName: String(property.name || "Property"), billingPeriod, invoiceNumber, issueDate: autoIssue ? now : null, dueDate, items: dues.lines, totalMinor: dues.totalMinor, status: autoIssue ? "issued" : "draft", invoiceBasis: "overdue_tenant_dues_v1", obligationRefs: dues.lines.map((line) => line.obligationRef), reconciliationMigrationKey: migrationKey, createdAt: now, updatedAt: now };
      await db.collection("tenantInvoices").insertOne(doc);
      await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoiceId.toString(), landlordId: doc.landlordId, tenantId, event: autoIssue ? "reconciliation_invoice_issued" : "reconciliation_draft_created", actorId: auth.userId, actorRole: auth.role, detail: { migrationKey, previewHash: current.previewHash, obligationRefs: doc.obligationRefs }, createdAt: now });
      await db.collection("tenantInvoices").updateMany({ tenantId, reconciliationMigrationKey: migrationKey, status: "superseded" }, { $set: { supersededByInvoiceId: invoiceId.toString(), supersededByInvoiceNumber: invoiceNumber, updatedAt: now } });
      regenerated++;
      if (autoIssue && settings?.automaticSending === true) {
        const email = String(tenant.email || "").trim();
        const log = await db.collection("tenantInvoiceDeliveries").insertOne({ invoiceId: invoiceId.toString(), landlordId: doc.landlordId, tenantId, channel: "email", status: "queued", actorId: auth.userId, createdAt: new Date(), updatedAt: new Date() });
        try {
          if (!email) throw new Error("Tenant email is missing");
          let paymentInstructions: string | undefined;
          try {
            const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId: doc.landlordId, propertyId });
            paymentInstructions = routing.paymentType === "bank" ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "contact your manager"}` : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${invoiceNumber}`;
          } catch { /* optional payment routing */ }
          const pdf = await generateTenantInvoicePdf({ invoiceNumber, issueDate: now, dueDate, billingPeriod, status: "issued", tenantName: doc.tenantName, tenantEmail: email, propertyName: doc.propertyName, propertyAddress: property.address, unitLabel: doc.unitLabel, items: dues.lines, totalMinor: dues.totalMinor, brandName: settings?.invoiceBrandName, brandColor: settings?.invoiceBrandColor, paymentInstructions });
          const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
          await sendInvoiceEmail({ to: email, ownerName: doc.tenantName, propertyName: doc.propertyName, amount: dues.totalMinor / 100, dueDate: dueDate.toLocaleDateString("en-KE"), reminderType: "manual", dashboardUrl: `${baseUrl}/tenant-dashboard/invoices`, invoiceNumber, pdfBytes: pdf.pdfBytes });
          await db.collection("tenantInvoiceDeliveries").updateOne({ _id: log.insertedId }, { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() } });
          emailSent++;
        } catch (error) {
          await db.collection("tenantInvoiceDeliveries").updateOne({ _id: log.insertedId }, { $set: { status: "failed", error: error instanceof Error ? error.message : "Email failed", updatedAt: new Date() } });
          emailFailed++;
        }
      }
    }
    const report = { migrationKey, previewHash: current.previewHash, archivedDrafts, supersededIssued, preservedPaymentHistory, manualReview, regenerated, skippedUpToDate, emailSent, emailFailed };
    await db.collection("tenantInvoiceReconciliationRuns").updateOne({ _id: runDoc._id }, { $set: { status: "completed", report, completedAt: new Date() } });
    return NextResponse.json({ success: true, report });
  } catch (error) {
    await db.collection("tenantInvoiceReconciliationRuns").updateOne({ _id: runDoc._id }, { $set: { status: "failed", error: error instanceof Error ? error.message : "Reconciliation failed", failedAt: new Date() } });
    throw error;
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

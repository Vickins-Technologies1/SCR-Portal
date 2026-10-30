import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { addInvoicePaymentStates, getPriorInvoiceOutstandingMinor, invoiceCategoryTotals, invoiceItemsForDisplay, validObjectId } from "@/lib/tenant-invoices";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";

type Ctx = { params: Promise<{ invoiceId: string }> };

async function scopedInvoice(request: NextRequest, id: string, db: any, manage = false) {
  if (!validObjectId(id)) return { error: "Invalid invoice ID", status: 400 } as const;
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(userId)) return { error: "Authentication required", status: 401 } as const;
  const invoice = await db.collection("tenantInvoices").findOne({ _id: new ObjectId(id) });
  if (!invoice) return { error: "Invoice not found", status: 404 } as const;
  if (role === "tenant") {
    if (invoice.tenantId !== userId || invoice.status !== "issued") return { error: "Invoice not found", status: 404 } as const;
    return { invoice, actorId: userId, actorRole: role, tenantView: true as const };
  }
  if (!(["propertyOwner", "teamMember"].includes(role))) return { error: "Unauthorized", status: 403 } as const;
  let landlordId = userId;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value || "";
    const member = ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    if (!member || !Array.isArray(member.assignedPropertyIds) || !member.assignedPropertyIds.map(String).includes(String(invoice.propertyId))) return { error: "Unauthorized", status: 403 } as const;
    const permissions = Array.isArray(member.permissions) ? member.permissions : [];
    const allowed = manage ? permissions.includes("payments:record") || permissions.includes("tenants:edit") : permissions.includes("payments:view") || permissions.includes("reports:view") || permissions.includes("tenants:view");
    if (!allowed) return { error: "Unauthorized", status: 403 } as const;
    landlordId = ownerId;
  }
  if (invoice.landlordId !== landlordId) return { error: "Unauthorized", status: 403 } as const;
  return { invoice, actorId: userId, actorRole: role, tenantView: false as const };
}

export async function GET(request: NextRequest, context: Ctx) {
  const { invoiceId } = await context.params;
  const { db } = await connectToDatabase();
  const scoped = await scopedInvoice(request, invoiceId, db);
  if ("error" in scoped) return NextResponse.json({ success: false, message: scoped.error }, { status: scoped.status });
  const [invoice] = await addInvoicePaymentStates(db, [scoped.invoice]);
  invoice.previousOutstandingMinor = await getPriorInvoiceOutstandingMinor(db, scoped.invoice);
  let paymentInstructions = "Use the payment method agreed with your property manager.";
  try {
    const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId: scoped.invoice.landlordId, propertyId: scoped.invoice.propertyId });
    paymentInstructions = routing.paymentType === "bank"
      ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "See your landlord"}`
      : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${scoped.invoice.invoiceNumber}`;
  } catch { /* configured destination is optional */ }
  const paymentHistory = await db.collection("financialLedger").find({ tenantId: scoped.invoice.tenantId, propertyId: scoped.invoice.propertyId, kind: { $in: ["PAYMENT_POSTED", "PAYMENT_REVERSED"] }, status: "posted" }).sort({ occurredAt: 1 }).project({ kind: 1, amount: 1, allocation: 1, providerReference: 1, occurredAt: 1 }).limit(100).toArray();
  const activityRows = await db.collection("tenantInvoiceActivity").find({ invoiceId: scoped.invoice._id.toString() }).sort({ createdAt: 1 }).project({ event: 1, createdAt: 1, ...(scoped.tenantView ? {} : { actorId: 1, actorRole: 1, detail: 1 }) }).toArray();
  return NextResponse.json({ success: true, invoice, paymentHistory, activity: activityRows, paymentInstructions });
}

export async function PATCH(request: NextRequest, context: Ctx) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!body || !["edit", "issue", "cancel", "adjust"].includes(body.action)) return NextResponse.json({ success: false, message: "Unsupported invoice action" }, { status: 400 });
  const { invoiceId } = await context.params;
  const { db } = await connectToDatabase();
  const scoped = await scopedInvoice(request, invoiceId, db, true);
  if ("error" in scoped) return NextResponse.json({ success: false, message: scoped.error }, { status: scoped.status });
  if (scoped.tenantView) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const invoice = scoped.invoice;
  if (body.action === "adjust") {
    if (invoice.status !== "issued") return NextResponse.json({ success: false, message: "Only issued invoices can be adjusted" }, { status: 409 });
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 120) : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    const value = Number(body.amount);
    const amountMinor = Number.isFinite(value) && value > 0 && value <= 1_000_000_000 ? Math.round(value * 100) : 0;
    const category = ["rent", "utilities", "other"].includes(body.category) ? body.category : "other";
    if (!description || !reason || !amountMinor || !["credit", "charge"].includes(body.direction)) return NextResponse.json({ success: false, message: "Provide a description, reason, positive amount, category, and credit or charge direction" }, { status: 400 });
    const signedAmount = body.direction === "credit" ? -amountMinor : amountMinor;
    const categoryTotals = invoiceCategoryTotals(invoice);
    if (signedAmount < 0 && amountMinor > categoryTotals[category as keyof typeof categoryTotals]) return NextResponse.json({ success: false, message: "Credit cannot exceed the remaining charge in its category" }, { status: 400 });
    const adjustedTotal = Object.values(categoryTotals).reduce((sum, total) => sum + total, 0) + signedAmount;
    if (!Number.isSafeInteger(adjustedTotal) || adjustedTotal <= 0) return NextResponse.json({ success: false, message: "Adjustment must leave a positive invoice total" }, { status: 400 });
    const now = new Date();
    const update = await db.collection("tenantInvoices").updateOne(
      { _id: invoice._id, status: "issued", ...(invoice.updatedAt ? { updatedAt: invoice.updatedAt } : {}) },
      { $push: { adjustments: { description, reason, category, amountMinor: signedAmount, direction: body.direction, actorId: scoped.actorId, createdAt: now } } as any, $set: { updatedAt: now } },
    );
    if (!update.modifiedCount) return NextResponse.json({ success: false, message: "Invoice changed concurrently; refresh and retry the adjustment" }, { status: 409 });
    await audit(db, scoped, "adjusted", { description, reason, category, amountMinor: signedAmount });
    const updatedInvoice = await db.collection("tenantInvoices").findOne({ _id: invoice._id });
    const [result] = await addInvoicePaymentStates(db, [updatedInvoice]);
    return NextResponse.json({ success: true, invoice: result });
  }
  if (body.action === "edit") {
    if (invoice.status !== "draft") return NextResponse.json({ success: false, message: "Only draft invoices can be edited" }, { status: 409 });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.dueDate !== undefined) {
      const date = new Date(body.dueDate);
      if (Number.isNaN(date.getTime())) return NextResponse.json({ success: false, message: "Invalid due date" }, { status: 400 });
      set.dueDate = date;
    }
    if (body.notes !== undefined) set.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
    if (body.items !== undefined) {
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) return NextResponse.json({ success: false, message: "Provide 1–50 invoice items" }, { status: 400 });
      const items = body.items.map((item: any) => ({ description: String(item?.description || "").trim().slice(0, 120), quantity: Number(item?.quantity), unitAmount: Math.round(Number(item?.unitPrice) * 100), category: ["rent", "utilities", "other"].includes(item?.category) ? item.category : "other" }));
      if (items.some((item: any) => !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10000 || !Number.isSafeInteger(item.unitAmount) || item.unitAmount <= 0)) return NextResponse.json({ success: false, message: "Each item requires a description, quantity and positive unit price" }, { status: 400 });
      const normalized = items.map((item: any) => ({ ...item, amount: Math.round(item.quantity * item.unitAmount) }));
      const totalMinor = normalized.reduce((sum: number, item: any) => sum + item.amount, 0);
      if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) return NextResponse.json({ success: false, message: "Invoice total is invalid" }, { status: 400 });
      set.items = normalized; set.totalMinor = totalMinor;
    }
    await db.collection("tenantInvoices").updateOne({ _id: invoice._id, status: "draft" }, { $set: set });
    await audit(db, scoped, "draft_updated", { changedFields: Object.keys(set) });
    return NextResponse.json({ success: true });
  }
  if (body.action === "cancel") {
    if (invoice.status === "cancelled") return NextResponse.json({ success: true, status: "cancelled" });
    if (invoice.status === "issued") {
      const [financial] = await addInvoicePaymentStates(db, [invoice]);
      if (Number(financial?.amountPaidMinor) > 0) return NextResponse.json({ success: false, message: "This invoice has payment allocations; reverse or adjust the financial records before cancellation" }, { status: 409 });
    }
    const result = await db.collection("tenantInvoices").updateOne(
      { _id: invoice._id, status: { $in: ["draft", "issued"] } },
      { $set: { status: "cancelled", cancelledAt: new Date(), cancelledBy: scoped.actorId, cancelReason: String(body.reason || "Cancelled by property manager").slice(0, 300), updatedAt: new Date() } },
    );
    if (!result.modifiedCount) return NextResponse.json({ success: false, message: "Invoice status changed; refresh and try again" }, { status: 409 });
    await audit(db, scoped, "cancelled", { reason: String(body.reason || "").slice(0, 300) });
    return NextResponse.json({ success: true, status: "cancelled" });
  }
  if (invoice.status !== "draft") return NextResponse.json({ success: false, message: "Invoice has already been issued" }, { status: 409 });
  const now = new Date();
  const settings = await db.collection("landlordBillingSettings").findOne({ landlordId: invoice.landlordId });
  const prefix = String(settings?.invoicePrefix || "R").replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 21) || "R";
  const issueNo = `${prefix}-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${invoice._id.toString().toUpperCase()}`;
  const issued = await db.collection("tenantInvoices").findOneAndUpdate(
    { _id: invoice._id, status: "draft" },
    { $set: { status: "issued", issueDate: now, invoiceNumber: issueNo, issuedBy: scoped.actorId, ...(body.approve === true ? { approvedBy: scoped.actorId, approvedAt: now } : {}), updatedAt: now } },
    { returnDocument: "after" },
  );
  const issuedInvoice = (issued as any)?.value ?? issued;
  if (!issuedInvoice || issuedInvoice.status !== "issued") return NextResponse.json({ success: false, message: "Invoice changed concurrently; refresh and try again" }, { status: 409 });
  await audit(db, { ...scoped, invoice: issuedInvoice }, body.approve === true ? "approved_and_issued" : "issued", { invoiceNumber: issueNo });
  let delivery: any = null;
  if (body.send === true) delivery = await deliverInvoice({ db, invoice: issuedInvoice, channel: body.channel || "email", actorId: scoped.actorId });
  const [result] = await addInvoicePaymentStates(db, [issuedInvoice]);
  return NextResponse.json({ success: true, invoice: result, delivery });
}

export async function POST(request: NextRequest, context: Ctx) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!body || !["resend", "retry"].includes(body.action)) return NextResponse.json({ success: false, message: "Unsupported invoice action" }, { status: 400 });
  const { invoiceId } = await context.params;
  const { db } = await connectToDatabase();
  const scoped = await scopedInvoice(request, invoiceId, db, true);
  if ("error" in scoped) return NextResponse.json({ success: false, message: scoped.error }, { status: scoped.status });
  if (scoped.tenantView || scoped.invoice.status !== "issued") return NextResponse.json({ success: false, message: "Only issued invoices can be sent" }, { status: 409 });
  const channel = body.channel || "email";
  if (body.action === "retry") {
    const latest = await db.collection("tenantInvoiceDeliveries").findOne({ invoiceId: scoped.invoice._id.toString(), channel }, { sort: { createdAt: -1 } });
    const staleQueue = latest?.status === "queued" && Date.now() - new Date(latest.createdAt).getTime() >= 15 * 60_000;
    if (!latest || latest.status !== "failed" && !staleQueue) return NextResponse.json({ success: false, message: "No failed delivery is available to retry" }, { status: 409 });
  }
  const delivery = await deliverInvoice({ db, invoice: scoped.invoice, channel, actorId: scoped.actorId });
  return NextResponse.json({ success: true, delivery });
}

async function deliverInvoice({ db, invoice, channel, actorId }: { db: any; invoice: any; channel: string; actorId: string }) {
  const allowed = ["email", "sms", "both", "app"];
  if (!allowed.includes(channel)) return { status: "failed", error: "Invalid delivery channel" };
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(invoice.tenantId) });
  const property = await db.collection("properties").findOne({ _id: new ObjectId(invoice.propertyId) });
  const landlord = await db.collection("propertyOwners").findOne({ _id: new ObjectId(invoice.landlordId) });
  const billingSettings = await db.collection("landlordBillingSettings").findOne({ landlordId: invoice.landlordId });
  const [financial] = await addInvoicePaymentStates(db, [invoice]);
  const previousOutstandingMinor = await getPriorInvoiceOutstandingMinor(db, invoice);
  if (!tenant || !property) return { status: "failed", error: "Tenant or property record is unavailable" };
  let instructions = "Use the payment method agreed with your property manager.";
  try {
    const routing = await resolveOwnerTenantMpesaRouting(db, { landlordId: invoice.landlordId, propertyId: invoice.propertyId });
    instructions = routing.paymentType === "bank"
      ? `Bank: ${routing.bank || "configured bank"}\nAccount: ${routing.bankAccount || "See your landlord"}`
      : `${routing.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${routing.shortcode}\nAccount/reference: ${invoice.invoiceNumber}`;
  } catch { /* do not block issue or send when payment settings are incomplete */ }
  const pdf = await generateTenantInvoicePdf({
    invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate, billingPeriod: invoice.billingPeriodLabel || invoice.billingPeriod, status: financial?.status || invoice.status,
    tenantName: tenant.name || invoice.tenantName, tenantEmail: tenant.email, propertyName: property.name || invoice.propertyName, propertyAddress: property.address,
    unitLabel: invoice.unitLabel, items: invoiceItemsForDisplay(invoice), totalMinor: financial?.totalMinor ?? invoice.totalMinor, amountPaidMinor: financial?.amountPaidMinor || 0, landlordName: landlord?.name, landlordEmail: landlord?.email,
    landlordPhone: landlord?.phone, brandName: billingSettings?.invoiceBrandName, brandColor: billingSettings?.invoiceBrandColor,
    previousOutstandingMinor, creditsAndAdjustmentsMinor: (invoice.adjustments || []).reduce((sum: number, row: any) => sum + Number(row.amountMinor || 0), 0), paymentInstructions: instructions,
  });
  const channels = channel === "both" ? ["email", "sms"] : [channel];
  const outcomes: Record<string, string> = {};
  for (const method of channels) {
    const previousAttempts = await db.collection("tenantInvoiceDeliveries").countDocuments({ invoiceId: invoice._id.toString(), channel: method });
    const log = await db.collection("tenantInvoiceDeliveries").insertOne({ invoiceId: invoice._id.toString(), landlordId: invoice.landlordId, tenantId: invoice.tenantId, channel: method, status: "queued", actorId, attempt: previousAttempts + 1, attempts: previousAttempts + 1, createdAt: new Date(), updatedAt: new Date() });
    try {
      if (method === "email") {
        if (!tenant.email) throw new Error("Tenant email address is missing");
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
        await sendInvoiceEmail({ to: tenant.email, ownerName: tenant.name || "Tenant", propertyName: property.name || "Property", amount: financial?.balanceDue ?? invoice.totalMinor / 100, dueDate: new Date(invoice.dueDate).toLocaleDateString("en-KE"), reminderType: "manual", dashboardUrl: `${baseUrl}/tenant-dashboard/invoices`, invoiceNumber: invoice.invoiceNumber, pdfBytes: pdf.pdfBytes });
      } else if (method === "sms") {
        if (!tenant.phone) throw new Error("Tenant phone number is missing");
        await sendWelcomeSms({ phone: tenant.phone, message: `My Accurate Rent: Invoice ${invoice.invoiceNumber} for ${property.name || "your property"}, KES ${(invoice.totalMinor / 100).toFixed(2)}, due ${new Date(invoice.dueDate).toLocaleDateString("en-KE")}. View in your tenant portal.` });
      } else {
        await db.collection("notifications").insertOne({ tenantId: invoice.tenantId, ownerId: invoice.landlordId, tenantName: tenant.name, audience: "tenant", type: "other", message: `Invoice ${invoice.invoiceNumber} issued for KES ${(invoice.totalMinor / 100).toFixed(2)}. Due ${new Date(invoice.dueDate).toLocaleDateString("en-KE")}.`, source: "tenant_invoice", sourceId: invoice._id.toString(), status: "unread", deliveryMethod: "app", deliveryStatus: "success", createdAt: new Date().toISOString() });
      }
      outcomes[method] = "sent";
      await db.collection("tenantInvoiceDeliveries").updateOne({ _id: log.insertedId }, { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() } });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Delivery failed";
      outcomes[method] = "failed";
      await db.collection("tenantInvoiceDeliveries").updateOne({ _id: log.insertedId }, { $set: { status: "failed", error: errorText, updatedAt: new Date() } });
    }
  }
  await db.collection("tenantInvoices").updateOne({ _id: invoice._id }, { $set: { lastDeliveryAt: new Date(), lastDeliveryChannel: channel } });
  await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoice._id.toString(), landlordId: invoice.landlordId, tenantId: invoice.tenantId, event: "delivery_attempted", channel, outcomes, actorId, createdAt: new Date() });
  return { outcomes };
}

async function audit(db: any, scoped: any, event: string, detail: Record<string, unknown>) {
  await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: scoped.invoice._id.toString(), landlordId: scoped.invoice.landlordId, tenantId: scoped.invoice.tenantId, event, detail, actorId: scoped.actorId, actorRole: scoped.actorRole, createdAt: new Date() });
}

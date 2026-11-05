import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { identityValues } from "@/lib/payment-query";
import { addInvoicePaymentStates, invoiceTotals, serializeTenantInvoice, validObjectId } from "@/lib/tenant-invoices";
import { calculateTenantInvoiceDues } from "@/lib/tenant-invoice-dues";

type InvoiceLine = { description: string; quantity: number; unitAmount: number; amount: number; category?: "rent" | "utilities" | "deposit" | "penalty" | "other" };
type TenantInvoice = {
  landlordId: string; tenantId: string; tenancyId: string; propertyId: string;
  unitLabel: string; tenantName: string; propertyName: string; billingPeriod: string;
  invoiceNumber: string; issueDate: Date | null; dueDate: Date; items: InvoiceLine[];
  totalMinor: number; status: string; createdAt: Date; updatedAt: Date;
  billingPeriodLabel?: string | null;
  invoiceBasis?: string;
  obligationRefs?: string[];
  obligationInvoiceIds?: string[];
};

const validPeriod = (period: unknown): period is string => typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
const amountMinor = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000_000 ? Math.round(n * 100) : 0;
};

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || !ObjectId.isValid(userId)) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const { db } = await connectToDatabase();
  if (role === "tenant") {
    const rows = await db.collection<TenantInvoice>("tenantInvoices").find({ tenantId: userId, status: { $nin: ["draft", "cancelled", "voided", "superseded"] } }).sort({ issueDate: -1 }).limit(100).toArray();
    return NextResponse.json({ success: true, invoices: await addInvoicePaymentStates(db, rows) });
  }
  if (!["propertyOwner", "teamMember"].includes(role || "")) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  let landlordId = userId;
  let assignedPropertyIds: string[] | null = null;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value;
    const member = ownerId && ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    if (!member) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const permissions = Array.isArray(member.permissions) ? member.permissions : [];
    if (role === "teamMember" && !permissions.includes("payments:view") && !permissions.includes("reports:view") && !permissions.includes("tenants:view")) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    landlordId = ownerId!;
    assignedPropertyIds = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const properties = await db.collection("properties").find({ ownerId: { $in: identityValues(landlordId) } }).project({ _id: 1 }).toArray();
  const propertyIds = properties.map((p) => p._id.toString()).filter((id) => assignedPropertyIds === null || assignedPropertyIds.includes(id));
  const params = new URL(request.url).searchParams;
  const period = params.get("period");
  const propertyId = params.get("propertyId");
  const tenantId = params.get("tenantId");
  if (propertyId && !propertyIds.includes(propertyId)) return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  if (tenantId && !ObjectId.isValid(tenantId)) return NextResponse.json({ success: false, message: "Invalid tenantId" }, { status: 400 });
  const statuses = ["all", "draft", "issued", "partially_paid", "paid", "overdue", "cancelled", "voided", "superseded"];
  if (params.has("status") && !statuses.includes(params.get("status") || "")) return NextResponse.json({ success: false, message: "Invalid invoice status" }, { status: 400 });
  const baseFilter: Record<string, any> = { landlordId, propertyId: propertyId ? propertyId : { $in: propertyIds } };
  if (tenantId) baseFilter.tenantId = tenantId;
  if (period) baseFilter.$or = [{ billingPeriod: period }, { billingPeriodLabel: period }];
  const term = params.get("search")?.trim().slice(0, 100);
  if (term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchClause = { $or: [{ invoiceNumber: { $regex: escaped, $options: "i" } }, { tenantName: { $regex: escaped, $options: "i" } }, { propertyName: { $regex: escaped, $options: "i" } }, { unitLabel: { $regex: escaped, $options: "i" } }] };
    if (baseFilter.$or) { baseFilter.$and = [{ $or: baseFilter.$or }, searchClause]; delete baseFilter.$or; }
    else Object.assign(baseFilter, searchClause);
  }
  const parsedLimit = Number(params.get("limit")), parsedPage = Number(params.get("page"));
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(1000, parsedLimit) : 500;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = Math.min(100_000, (page - 1) * limit);
  const rows = propertyIds.length ? await db.collection<TenantInvoice>("tenantInvoices").find(baseFilter).sort({ issueDate: -1, createdAt: -1, _id: -1 }).limit(2000).toArray() : [];
  let calculated = await addInvoicePaymentStates(db, rows);
  const wantedStatus = params.get("status");
  if (wantedStatus && wantedStatus !== "all") calculated = calculated.filter((row) => row.status === wantedStatus);
  const startDate = params.get("startDate"), endDate = params.get("endDate");
  const validDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if ((startDate && !validDateKey(startDate)) || (endDate && !validDateKey(endDate)) || (startDate && endDate && endDate < startDate)) return NextResponse.json({ success: false, message: "Invalid date range" }, { status: 400 });
  if (startDate || endDate) calculated = calculated.filter((row) => {
    const date = String(row.issueDate || row.createdAt || "").slice(0, 10);
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });
  const total = calculated.length;
  const deliveryRows = calculated.length ? await db.collection("tenantInvoiceDeliveries").find({ invoiceId: { $in: calculated.map((invoice) => invoice._id) } }).sort({ createdAt: -1, _id: -1 }).project({ invoiceId: 1, channel: 1, status: 1 }).toArray() : [];
  const latestDelivery = new Map<string, any>();
  for (const delivery of deliveryRows) {
    const key = `${delivery.invoiceId}:${delivery.channel}`;
    if (!latestDelivery.has(key)) latestDelivery.set(key, delivery);
  }
  const retryable = new Map<string, Set<string>>();
  for (const delivery of latestDelivery.values()) if (delivery.status === "failed" || delivery.status === "queued" && Date.now() - new Date(delivery.createdAt).getTime() >= 15 * 60_000) {
    const invoiceId = String(delivery.invoiceId);
    const channels = retryable.get(invoiceId) || new Set<string>();
    channels.add(String(delivery.channel));
    retryable.set(invoiceId, channels);
  }
  return NextResponse.json({ success: true, invoices: calculated.slice(offset, offset + limit), page, limit, total, hasMore: offset + limit < total, truncated: rows.length === 2000, retryableChannels: Object.fromEntries([...retryable].map(([id, channels]) => [id, [...channels]])) });
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (body?.action !== "manual" && !validPeriod(body?.billingPeriod)) return NextResponse.json({ success: false, message: "billingPeriod must use YYYY-MM format" }, { status: 400 });
  if (body?.action === "manual" && body.billingPeriod !== undefined && !validPeriod(body.billingPeriod)) return NextResponse.json({ success: false, message: "billingPeriod must use YYYY-MM format" }, { status: 400 });
  if (body.tenantIds !== undefined && (!Array.isArray(body.tenantIds) || body.tenantIds.length > 500 || body.tenantIds.some((id: unknown) => typeof id !== "string" || !ObjectId.isValid(id)))) {
    return NextResponse.json({ success: false, message: "tenantIds must be a list of valid tenant IDs" }, { status: 400 });
  }
  if (body.propertyId !== undefined && (typeof body.propertyId !== "string" || !ObjectId.isValid(body.propertyId))) {
    return NextResponse.json({ success: false, message: "Invalid propertyId" }, { status: 400 });
  }
  const { db } = await connectToDatabase();
  await db.collection("tenantInvoices").createIndexes([
    { key: { tenancyId: 1, billingPeriod: 1 }, name: "tenantInvoices_tenancy_period_unique", unique: true },
    { key: { invoiceNumber: 1 }, name: "tenantInvoices_invoiceNumber_unique", unique: true },
  ]);
  let landlordId = userId;
  let assignedPropertyIds: string[] | null = null;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value;
    const member = ownerId && ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    if (!member) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const permissions = Array.isArray(member.permissions) ? member.permissions : [];
    if (!permissions.includes("payments:record") && !permissions.includes("tenants:edit")) return NextResponse.json({ success: false, message: "You do not have permission to manage invoices" }, { status: 403 });
    landlordId = ownerId!;
    assignedPropertyIds = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const billingSettings = await db.collection("landlordBillingSettings").findOne({ landlordId });
  const eligibleSettingsPropertyIds = Array.isArray(billingSettings?.eligiblePropertyIds) ? billingSettings.eligiblePropertyIds.map(String) : [];
  const propertyFilter: Record<string, unknown> = { ownerId: { $in: identityValues(landlordId) } };
  if (body.action !== "manual" && eligibleSettingsPropertyIds.length && body.propertyId && !eligibleSettingsPropertyIds.includes(body.propertyId)) {
    return NextResponse.json({ success: false, message: "Property is excluded from invoicing settings" }, { status: 403 });
  }
  if (assignedPropertyIds !== null && body.propertyId && !assignedPropertyIds.includes(body.propertyId)) {
    return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  }
  if (body.propertyId) propertyFilter._id = new ObjectId(body.propertyId);
  else if (assignedPropertyIds !== null) propertyFilter._id = { $in: assignedPropertyIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) };
  if (body.action !== "manual" && eligibleSettingsPropertyIds.length && !body.propertyId) {
    const eligible = eligibleSettingsPropertyIds.filter((id: string) => ObjectId.isValid(id) && (assignedPropertyIds === null || assignedPropertyIds.includes(id)));
    propertyFilter._id = { $in: eligible.map((id: string) => new ObjectId(id)) };
  }
  const properties = await db.collection("properties").find(propertyFilter).toArray();
  if (body.propertyId && properties.length === 0) return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  const propertyIds = properties.map((p) => p._id.toString());
  if (!propertyIds.length) return NextResponse.json({ success: false, message: "No properties found" }, { status: 400 });
  if (body.action === "dues") {
    if (!validObjectId(body.tenantId)) return NextResponse.json({ success: false, message: "Valid tenantId is required" }, { status: 400 });
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(body.tenantId), propertyId: { $in: identityValues(propertyIds) } });
    const property = tenant && properties.find((p) => String(p._id) === String(tenant.propertyId));
    if (!tenant || !property) return NextResponse.json({ success: false, message: "Tenant not found for an authorized property" }, { status: 404 });
    const settings = await db.collection("landlordBillingSettings").findOne({ landlordId });
    if (tenant.invoiceEnabled === false || ["inactive", "vacated"].includes(String(tenant.status)) || (settings?.excludedTenantIds || []).map(String).includes(String(tenant._id)) || Array.isArray(settings?.eligibleTenantIds) && settings.eligibleTenantIds.length > 0 && !settings.eligibleTenantIds.map(String).includes(String(tenant._id)) || Array.isArray(settings?.eligiblePropertyIds) && settings.eligiblePropertyIds.length > 0 && !settings.eligiblePropertyIds.map(String).includes(String(property._id))) return NextResponse.json({ success: false, message: "Tenant is not eligible for invoicing" }, { status: 409 });
    const dues = await calculateTenantInvoiceDues(db, tenant, property);
    if (dues.totalMinor <= 0) return NextResponse.json({ success: false, message: "Tenant has no overdue eligible charges" }, { status: 409 });
    const now = new Date();
    const invoiceId = new ObjectId();
    const currentPeriod = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(now);
    const billingPeriod = `DUES-${currentPeriod}`;
    const invoiceNumber = `DRAFT-${invoiceId.toString().toUpperCase()}`;
    const dueDate = dues.lines.reduce((earliest, line) => line.dueDate < earliest ? line.dueDate : earliest, dues.lines[0].dueDate);
    const doc: any = {
      _id: invoiceId, landlordId, tenantId: tenant._id.toString(), tenancyId: tenant._id.toString(), propertyId: property._id.toString(),
      unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"), tenantName: String(tenant.name || "Tenant"),
      propertyName: String(property.name || "Property"), billingPeriod, billingPeriodLabel: body.billingPeriod, invoiceNumber, issueDate: null, dueDate,
      items: dues.lines, totalMinor: dues.totalMinor, status: "draft", invoiceBasis: "overdue_tenant_dues_v1",
      obligationRefs: dues.lines.map((line) => line.obligationRef), createdAt: now, updatedAt: now,
    };
    try {
      const result = await db.collection("tenantInvoices").updateOne({ tenancyId: doc.tenancyId, billingPeriod }, { $setOnInsert: doc }, { upsert: true });
      const invoice = result.upsertedCount ? doc : await db.collection("tenantInvoices").findOne({ tenancyId: doc.tenancyId, billingPeriod });
      if (!result.upsertedCount) return NextResponse.json({ success: false, message: "A dues invoice already exists for this tenant and billing period", invoice: invoice ? serializeTenantInvoice(invoice) : undefined }, { status: 409 });
      await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoiceId.toString(), landlordId, tenantId: tenant._id.toString(), event: "dues_draft_created", actorId: userId, actorRole: role, detail: { obligationRefs: doc.obligationRefs, totalMinor: doc.totalMinor }, createdAt: now });
      return NextResponse.json({ success: true, invoice: serializeTenantInvoice(doc), dues }, { status: 201 });
    } catch (error: any) {
      if (error?.code === 11000) return NextResponse.json({ success: false, message: "A dues invoice already exists for this tenant and billing period" }, { status: 409 });
      throw error;
    }
  }
  if (body.action === "manual") {
    if (!validObjectId(body.tenantId) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50 || typeof body.dueDate !== "string" || Number.isNaN(new Date(body.dueDate).getTime())) {
      return NextResponse.json({ success: false, message: "Tenant, valid due date, and 1–50 charge items are required" }, { status: 400 });
    }
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(body.tenantId), propertyId: { $in: identityValues(propertyIds) } });
    const property = tenant && properties.find((p) => String(p._id) === String(tenant.propertyId));
    if (!tenant || !property) return NextResponse.json({ success: false, message: "Tenant not found for an authorized property" }, { status: 404 });
    const inputItems = body.items.map((item: any) => ({
      description: typeof item?.description === "string" ? item.description.trim().slice(0, 120) : "",
      quantity: Number(item?.quantity), unitAmount: amountMinor(item?.unitPrice),
      category: ["rent", "utilities", "deposit", "penalty", "other"].includes(item?.category) ? item.category : "other",
    }));
    if (inputItems.some((item: any) => !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10000 || !item.unitAmount)) {
      return NextResponse.json({ success: false, message: "Each item needs a description, positive quantity, and unit price" }, { status: 400 });
    }
    const calculated = invoiceTotals(inputItems);
    const invoiceId = new ObjectId();
    const doc: any = {
      _id: invoiceId, landlordId, tenantId: tenant._id.toString(), tenancyId: tenant._id.toString(), propertyId: property._id.toString(),
      unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"), tenantName: String(tenant.name || "Tenant"),
      propertyName: String(property.name || "Property"), billingPeriod: `MANUAL-${invoiceId.toString()}`, billingPeriodLabel: validPeriod(body.billingPeriod) ? body.billingPeriod : null,
      invoiceNumber: `DRAFT-${invoiceId.toString().toUpperCase()}`, issueDate: null, dueDate: new Date(body.dueDate),
      items: calculated.items.map((item, index) => ({ ...item, category: inputItems[index].category })), totalMinor: calculated.totalMinor,
      status: "draft", notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "", createdBy: userId,
      createdAt: new Date(), updatedAt: new Date(),
    };
    await db.collection("tenantInvoices").insertOne(doc);
    await db.collection("tenantInvoiceActivity").insertOne({ invoiceId: invoiceId.toString(), landlordId, tenantId: tenant._id.toString(), event: "draft_created", actorId: userId, actorRole: role, createdAt: new Date() });
    return NextResponse.json({ success: true, invoice: serializeTenantInvoice(doc) }, { status: 201 });
  }
  const tenants = await db.collection("tenants").find({ propertyId: { $in: identityValues(propertyIds) } }).toArray();
  const excludedTenantIds = new Set((Array.isArray(billingSettings?.excludedTenantIds) ? billingSettings.excludedTenantIds : []).map(String));
  const eligibleTenantIds = new Set((Array.isArray(billingSettings?.eligibleTenantIds) ? billingSettings.eligibleTenantIds : []).map(String));
  const [year, month] = body.billingPeriod.split("-").map(Number);
  const now = new Date();
  const currentPeriod = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(now);
  const billingPeriodLabel = `Current due balance · ${currentPeriod}`;
  const eligible = tenants.filter((tenant) => {
    if (excludedTenantIds.has(tenant._id.toString())) return false;
    if (eligibleTenantIds.size && !eligibleTenantIds.has(tenant._id.toString())) return false;
    if (body.tenantIds && Array.isArray(body.tenantIds) && !body.tenantIds.includes(tenant._id.toString())) return false;
    if (tenant.invoiceEnabled === false || tenant.status === "inactive" || tenant.status === "vacated") return false;
    const leaseEnd = tenant.leaseEndDate ? new Date(tenant.leaseEndDate) : null;
    const leaseStart = tenant.leaseStartDate ? new Date(tenant.leaseStartDate) : null;
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return (!leaseStart || Number.isNaN(leaseStart.getTime()) || leaseStart <= periodEnd) && (!leaseEnd || Number.isNaN(leaseEnd.getTime()) || leaseEnd >= periodStart);
  });
  let created = 0; let duplicate = 0; let skipped = 0;
  for (const tenant of eligible) {
    const property = properties.find((p) => String(p._id) === String(tenant.propertyId));
    if (!property) { skipped++; continue; }
    const dues = await calculateTenantInvoiceDues(db, tenant, property, new Date());
    if (dues.totalMinor <= 0) { skipped++; continue; }
    const dueDate = dues.lines.reduce((earliest, line) => line.dueDate < earliest ? line.dueDate : earliest, dues.lines[0].dueDate);
    const invoiceNumber = `R-${landlordId.slice(-5).toUpperCase()}-${currentPeriod.replace("-", "")}-${tenant._id.toString().toUpperCase()}`;
    const items: InvoiceLine[] = dues.lines.map((line) => ({ ...line }));
    const doc: TenantInvoice = {
      landlordId, tenantId: tenant._id.toString(), tenancyId: tenant._id.toString(), propertyId: property._id.toString(),
      unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"),
      tenantName: String(tenant.name || "Tenant"), propertyName: String(property.name || "Property"), billingPeriod: currentPeriod, billingPeriodLabel,
      invoiceNumber, issueDate: null, dueDate, items,
      totalMinor: dues.totalMinor, status: "draft", invoiceBasis: "overdue_tenant_dues_v1", obligationRefs: dues.lines.map((line) => line.obligationRef), obligationInvoiceIds: dues.existingInvoiceIds, createdAt: now, updatedAt: now,
    };
    try {
      const result = await db.collection<TenantInvoice>("tenantInvoices").updateOne(
        { tenancyId: doc.tenancyId, billingPeriod: doc.billingPeriod },
        { $setOnInsert: doc },
        { upsert: true },
      );
      if (result.upsertedCount) created++; else duplicate++;
    } catch (error: any) {
      if (error?.code === 11000) duplicate++; else throw error;
    }
  }
  return NextResponse.json({ success: true, billingPeriod: currentPeriod, requestedPeriod: body.billingPeriod, billingPeriodLabel, created, duplicate, skipped });
}

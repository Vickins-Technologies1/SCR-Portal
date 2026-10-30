import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { identityValues } from "@/lib/payment-query";

type InvoiceLine = { description: string; quantity: number; unitAmount: number; amount: number };
type TenantInvoice = {
  landlordId: string; tenantId: string; tenancyId: string; propertyId: string;
  unitLabel: string; tenantName: string; propertyName: string; billingPeriod: string;
  invoiceNumber: string; issueDate: Date; dueDate: Date; items: InvoiceLine[];
  totalMinor: number; status: "draft"; createdAt: Date; updatedAt: Date;
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
    const rows = await db.collection<TenantInvoice>("tenantInvoices").find({ tenantId: userId, status: { $ne: "draft" } }).sort({ issueDate: -1 }).limit(100).toArray();
    return NextResponse.json({ success: true, invoices: rows.map(serialize) });
  }
  if (!["propertyOwner", "teamMember"].includes(role || "")) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  let landlordId = userId;
  let assignedPropertyIds: string[] | null = null;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value;
    const member = ownerId && ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    if (!member) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    landlordId = ownerId!;
    assignedPropertyIds = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const properties = await db.collection("properties").find({ ownerId: { $in: identityValues(landlordId) } }).project({ _id: 1 }).toArray();
  const propertyIds = properties.map((p) => p._id.toString()).filter((id) => assignedPropertyIds === null || assignedPropertyIds.includes(id));
  const rows = propertyIds.length ? await db.collection<TenantInvoice>("tenantInvoices").find({ landlordId, propertyId: { $in: propertyIds } }).sort({ issueDate: -1 }).limit(500).toArray() : [];
  const period = new URL(request.url).searchParams.get("period");
  const filtered = period ? rows.filter((row) => row.billingPeriod === period) : rows;
  return NextResponse.json({ success: true, invoices: filtered.map(serialize) });
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!validPeriod(body?.billingPeriod)) return NextResponse.json({ success: false, message: "billingPeriod must use YYYY-MM format" }, { status: 400 });
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
    landlordId = ownerId!;
    assignedPropertyIds = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const propertyFilter: Record<string, unknown> = { ownerId: { $in: identityValues(landlordId) } };
  if (assignedPropertyIds !== null && body.propertyId && !assignedPropertyIds.includes(body.propertyId)) {
    return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  }
  if (body.propertyId) propertyFilter._id = new ObjectId(body.propertyId);
  else if (assignedPropertyIds !== null) propertyFilter._id = { $in: assignedPropertyIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) };
  const properties = await db.collection("properties").find(propertyFilter).toArray();
  if (body.propertyId && properties.length === 0) return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  const propertyIds = properties.map((p) => p._id.toString());
  if (!propertyIds.length) return NextResponse.json({ success: false, message: "No properties found" }, { status: 400 });
  const tenants = await db.collection("tenants").find({ propertyId: { $in: identityValues(propertyIds) } }).toArray();
  const [year, month] = body.billingPeriod.split("-").map(Number);
  const issueDate = new Date(Date.UTC(year, month - 1, 1));
  const now = new Date();
  const eligible = tenants.filter((tenant) => {
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
    const rent = amountMinor(tenant.price);
    if (!property || !rent) { skipped++; continue; }
    const day = Math.min(28, Math.max(1, Number(property.rentPaymentDate) || 1));
    const dueDate = new Date(Date.UTC(year, month - 1, day));
    const invoiceNumber = `R-${landlordId.slice(-5).toUpperCase()}-${body.billingPeriod.replace("-", "")}-${tenant._id.toString().toUpperCase()}`;
    const doc: TenantInvoice = {
      landlordId, tenantId: tenant._id.toString(), tenancyId: tenant._id.toString(), propertyId: property._id.toString(),
      unitLabel: String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—"),
      tenantName: String(tenant.name || "Tenant"), propertyName: String(property.name || "Property"), billingPeriod: body.billingPeriod,
      invoiceNumber, issueDate, dueDate, items: [{ description: `Monthly rent — ${body.billingPeriod}`, quantity: 1, unitAmount: rent, amount: rent }],
      totalMinor: rent, status: "draft", createdAt: now, updatedAt: now,
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
  return NextResponse.json({ success: true, billingPeriod: body.billingPeriod, created, duplicate, skipped });
}

function serialize(row: TenantInvoice) {
  return { ...row, _id: (row as any)._id?.toString(), issueDate: new Date(row.issueDate).toISOString(), dueDate: new Date(row.dueDate).toISOString(), createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), total: row.totalMinor / 100 };
}

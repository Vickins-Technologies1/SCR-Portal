import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { identityValues } from "@/lib/payment-query";
import { calculateTenantInvoiceDues } from "@/lib/tenant-invoice-dues";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const { db } = await connectToDatabase();
  let landlordId = userId;
  let assigned: string[] | null = null;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value || "";
    const member = ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    const permissions = Array.isArray(member?.permissions) ? member.permissions : [];
    if (!member || (!permissions.includes("reports:view") && !permissions.includes("payments:view") && !permissions.includes("payments:record") && !permissions.includes("tenants:edit"))) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    landlordId = ownerId; assigned = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const params = new URL(request.url).searchParams;
  const requestedProperty = params.get("propertyId");
  const requestedTenant = params.get("tenantId");
  if (requestedProperty && requestedProperty !== "all" && !ObjectId.isValid(requestedProperty) || requestedTenant && requestedTenant !== "all" && !ObjectId.isValid(requestedTenant)) return NextResponse.json({ success: false, message: "Invalid property or tenant filter" }, { status: 400 });
  const properties = await db.collection("properties").find({ ownerId: { $in: identityValues(landlordId) }, ...(requestedProperty && requestedProperty !== "all" ? { _id: new ObjectId(requestedProperty) } : {}) }).toArray();
  const visibleProperties = properties.filter((property: any) => assigned === null || assigned.includes(String(property._id)));
  const propertyIds = visibleProperties.map((property: any) => String(property._id));
  const tenants = propertyIds.length ? await db.collection("tenants").find({ propertyId: { $in: identityValues(propertyIds) }, ...(requestedTenant && requestedTenant !== "all" ? { _id: new ObjectId(requestedTenant) } : {}) }).toArray() : [];
  const settings = await db.collection("landlordBillingSettings").findOne({ landlordId });
  const excluded = new Set((settings?.excludedTenantIds || []).map(String));
  const eligibleSet = new Set((settings?.eligibleTenantIds || []).map(String));
  const entries = [];
  for (const tenant of tenants) {
    const property = visibleProperties.find((row: any) => String(row._id) === String(tenant.propertyId));
    if (!property) continue;
    const inactive = tenant.invoiceEnabled === false || ["inactive", "vacated"].includes(String(tenant.status));
    const dues = inactive || excluded.has(String(tenant._id)) || eligibleSet.size && !eligibleSet.has(String(tenant._id)) ? null : await calculateTenantInvoiceDues(db, tenant, property);
    const reason = inactive ? "inactive_or_vacated" : excluded.has(String(tenant._id)) || eligibleSet.size && !eligibleSet.has(String(tenant._id)) ? "excluded_by_settings" : !dues?.totalMinor ? "no_overdue_balance" : dues.existingInvoiceIds.length ? "valid_invoice_exists" : "eligible_for_invoicing";
    entries.push({ tenantId: String(tenant._id), tenantName: tenant.name || "Tenant", propertyId: String(property._id), propertyName: property.name || "Property", unit: tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—", reason, dues });
  }
  const obsoleteInvoices = await db.collection("tenantInvoices").find({ landlordId, $or: [{ reconciliationReviewRequired: true }, { status: "draft", invoiceBasis: { $exists: false }, billingPeriod: /^\d{4}-\d{2}$/ }] }).project({ _id: 1, invoiceNumber: 1, tenantName: 1, propertyName: 1, status: 1, totalMinor: 1 }).limit(200).toArray();
  return NextResponse.json({ success: true, billingPeriod: params.get("period") || null, entries, obsoleteInvoices: obsoleteInvoices.map((invoice: any) => ({ ...invoice, _id: String(invoice._id) })), totals: { tenants: entries.length, eligible: entries.filter((row: any) => row.reason === "eligible_for_invoicing").length, upToDate: entries.filter((row: any) => row.reason === "no_overdue_balance").length, withValidInvoices: entries.filter((row: any) => row.reason === "valid_invoice_exists").length, inactive: entries.filter((row: any) => row.reason === "inactive_or_vacated").length, utilities: entries.filter((row: any) => Number(row.dues?.utilitiesMinor || 0) > 0).length, overdueRent: entries.filter((row: any) => Number(row.dues?.rentMinor || 0) > 0).length } });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

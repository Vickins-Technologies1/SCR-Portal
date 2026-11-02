import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { identityValues } from "@/lib/payment-query";
import { calculateTenantInvoiceDues } from "@/lib/tenant-invoice-dues";

export async function POST(request: NextRequest) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.tenantId !== "string" || !ObjectId.isValid(body.tenantId)) return NextResponse.json({ success: false, message: "A valid tenantId is required" }, { status: 400 });
  const { db } = await connectToDatabase();
  let landlordId = userId;
  let assigned: string[] | null = null;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value || "";
    const member = ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    const permissions = Array.isArray(member?.permissions) ? member.permissions : [];
    if (!member || (!permissions.includes("payments:record") && !permissions.includes("tenants:edit"))) return NextResponse.json({ success: false, message: "You do not have permission to preview invoices" }, { status: 403 });
    landlordId = ownerId;
    assigned = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(body.tenantId) });
  if (!tenant) return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  const propertyId = String(tenant.propertyId || "");
  if (assigned && !assigned.includes(propertyId)) return NextResponse.json({ success: false, message: "Tenant is outside your assigned properties" }, { status: 403 });
  const property = await db.collection("properties").findOne({ _id: ObjectId.isValid(propertyId) ? new ObjectId(propertyId) : propertyId, ownerId: { $in: identityValues(landlordId) } } as any);
  if (!property) return NextResponse.json({ success: false, message: "Tenant is outside your properties" }, { status: 404 });
  const settings = await db.collection("landlordBillingSettings").findOne({ landlordId });
  if (tenant.invoiceEnabled === false || ["inactive", "vacated"].includes(String(tenant.status)) || (settings?.excludedTenantIds || []).map(String).includes(String(tenant._id)) || Array.isArray(settings?.eligibleTenantIds) && settings.eligibleTenantIds.length > 0 && !settings.eligibleTenantIds.map(String).includes(String(tenant._id)) || Array.isArray(settings?.eligiblePropertyIds) && settings.eligiblePropertyIds.length > 0 && !settings.eligiblePropertyIds.map(String).includes(String(property._id))) return NextResponse.json({ success: false, message: "Tenant is not eligible for invoicing" }, { status: 409 });
  const dues = await calculateTenantInvoiceDues(db, tenant, property);
  return NextResponse.json({
    success: true,
    preview: {
      tenant: { id: String(tenant._id), name: tenant.name || "Tenant" },
      property: { id: String(property._id), name: property.name || "Property", unit: tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—" },
      rentMinor: dues.rentMinor, utilitiesMinor: dues.utilitiesMinor, otherMinor: dues.otherMinor,
      paymentsAllocatedMinor: dues.paymentsAllocatedMinor, walletBalanceMinor: dues.walletBalanceMinor,
      existingInvoiceIds: dues.existingInvoiceIds, existingInvoiceBalanceMinor: dues.existingInvoiceBalanceMinor,
      totalMinor: dues.totalMinor, obligations: dues.obligations.filter((item) => item.eligible).map((item) => ({ ...item, dueDate: item.dueDate.toISOString() })),
      automaticIssuing: settings?.automaticIssuing === true && settings?.manualApproval !== true,
      automaticSending: settings?.automaticSending === true,
    },
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

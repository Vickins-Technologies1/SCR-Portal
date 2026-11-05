import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { identityValues } from "@/lib/payment-query";
import { addInvoicePaymentStates } from "@/lib/tenant-invoices";
import { summarizeTenantInvoices } from "@/lib/tenant-invoice-summary";
import { businessDayEnd, businessDayStart } from "@/lib/business-time";

function dateBoundary(value: string | null, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(userId)) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (role !== "propertyOwner" && role !== "teamMember") return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const { db } = await connectToDatabase();
  let landlordId = userId;
  let assignedPropertyIds: string[] | null = null;
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value || "";
    const member = ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    const permissions = Array.isArray(member?.permissions) ? member.permissions : [];
    if (!member || (!permissions.includes("reports:view") && !permissions.includes("payments:view"))) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    landlordId = ownerId;
    assignedPropertyIds = Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [];
  }
  const params = new URL(request.url).searchParams;
  const propertyId = params.get("propertyId");
  if (propertyId && propertyId !== "all" && !ObjectId.isValid(propertyId)) return NextResponse.json({ success: false, message: "Invalid propertyId" }, { status: 400 });
  const startDate = dateBoundary(params.get("startDate"));
  const endDate = dateBoundary(params.get("endDate"), true);
  if (startDate === undefined || endDate === undefined || (startDate && endDate && startDate > endDate)) return NextResponse.json({ success: false, message: "Invalid invoice reporting date range" }, { status: 400 });
  const properties = await db.collection("properties").find({ ownerId: { $in: identityValues(landlordId) } }).project({ _id: 1 }).toArray();
  const allowedPropertyIds = properties.map((property) => String(property._id)).filter((id) => assignedPropertyIds === null || assignedPropertyIds.includes(id));
  if (propertyId && propertyId !== "all" && !allowedPropertyIds.includes(propertyId)) return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  const selectedPropertyIds = propertyId && propertyId !== "all" ? [propertyId] : allowedPropertyIds;
  const filter: Record<string, any> = { landlordId, propertyId: { $in: selectedPropertyIds }, status: { $in: ["draft", "issued", "partially_paid", "paid", "overdue"] } };
  if (startDate || endDate) filter.issueDate = { ...(startDate ? { $gte: startDate } : {}), ...(endDate ? { $lte: endDate } : {}) };
  const rows = selectedPropertyIds.length ? await db.collection("tenantInvoices").find(filter).sort({ issueDate: -1, _id: -1 }).toArray() : [];
  const calculated = await addInvoicePaymentStates(db, rows);
  const summary = summarizeTenantInvoices(calculated);
  const today = new Date();
  const todayStart = businessDayStart(today);
  const todayEnd = businessDayEnd(today);
  const propertyScope = { propertyId: { $in: selectedPropertyIds } };
  const [generatedToday, failedDeliveries, failedGenerations] = selectedPropertyIds.length ? await Promise.all([
    db.collection("tenantInvoices").countDocuments({ landlordId, ...propertyScope, issueDate: { $gte: todayStart, $lte: todayEnd } }),
    db.collection("tenantInvoiceDeliveries").countDocuments({ landlordId, status: "failed", createdAt: { $gte: todayStart, $lte: todayEnd } }),
    db.collection("tenantInvoiceAutomationFailures").countDocuments({ landlordId, status: "failed", ...propertyScope }),
  ]) : [0, 0, 0];
  const recentFailures = selectedPropertyIds.length ? await db.collection("tenantInvoiceAutomationFailures").find({ landlordId, status: "failed", ...propertyScope }).sort({ updatedAt: -1 }).limit(20).project({ tenantId: 1, propertyId: 1, period: 1, error: 1, updatedAt: 1 }).toArray() : [];
  return NextResponse.json({ success: true, summary, health: {
    generatedToday,
    pendingDrafts: summary.draftInvoices,
    issued: summary.totalInvoices,
    partiallyPaid: summary.partiallyPaidInvoices,
    overdue: summary.overdueInvoices,
    paid: summary.paidInvoices,
    failedDeliveries,
    failedAutomaticGenerations: failedGenerations,
    recentFailures,
  } });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

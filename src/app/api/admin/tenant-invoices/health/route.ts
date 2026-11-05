import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { addInvoicePaymentStates } from "@/lib/tenant-invoices";
import { summarizeTenantInvoices } from "@/lib/tenant-invoice-summary";
import { businessDayEnd, businessDayStart } from "@/lib/business-time";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:view");
  if (auth instanceof NextResponse) return auth;

  const { db } = await connectToDatabase();
  const rows = await db.collection("tenantInvoices").find({
    status: { $in: ["draft", "issued", "partially_paid", "paid", "overdue"] },
  }).sort({ issueDate: -1, _id: -1 }).toArray();
  const issued = rows.filter((row: any) => row.status !== "draft");
  const calculated = await addInvoicePaymentStates(db, issued);
  const summary = summarizeTenantInvoices([...calculated, ...rows.filter((row: any) => row.status === "draft")]);
  const today = new Date();
  const todayStart = businessDayStart(today);
  const todayEnd = businessDayEnd(today);
  const [generatedToday, failedDeliveries, failedAutomaticGenerations, failures] = await Promise.all([
    db.collection("tenantInvoices").countDocuments({ issueDate: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ["draft", "cancelled", "voided", "superseded"] } }),
    db.collection("tenantInvoiceDeliveries").countDocuments({ status: "failed", createdAt: { $gte: todayStart, $lte: todayEnd } }),
    db.collection("tenantInvoiceAutomationFailures").countDocuments({ status: "failed" }),
    db.collection("tenantInvoiceAutomationFailures").find({ status: "failed" }).sort({ updatedAt: -1 }).limit(30).toArray(),
  ]);
  const tenantIds = [...new Set(failures.map((row: any) => String(row.tenantId || "")).filter(ObjectId.isValid))];
  const propertyIds = [...new Set(failures.map((row: any) => String(row.propertyId || "")).filter(ObjectId.isValid))];
  const [tenants, properties] = await Promise.all([
    tenantIds.length ? db.collection("tenants").find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) } }).project({ name: 1 }).toArray() : [],
    propertyIds.length ? db.collection("properties").find({ _id: { $in: propertyIds.map((id) => new ObjectId(id)) } }).project({ name: 1 }).toArray() : [],
  ]);
  const tenantNames = new Map(tenants.map((row: any) => [String(row._id), String(row.name || "Tenant")]));
  const propertyNames = new Map(properties.map((row: any) => [String(row._id), String(row.name || "Property")]));
  return NextResponse.json({
    success: true,
    summary,
    health: {
      generatedToday,
      pendingDrafts: summary.draftInvoices,
      issued: calculated.filter((row: any) => row.status === "issued").length,
      partiallyPaid: summary.partiallyPaidInvoices,
      overdue: summary.overdueInvoices,
      paid: summary.paidInvoices,
      failedDeliveries,
      failedAutomaticGenerations,
      recentFailures: failures.map((row: any) => ({
        tenantId: String(row.tenantId || ""), tenantName: tenantNames.get(String(row.tenantId)) || "Tenant",
        propertyId: String(row.propertyId || ""), propertyName: propertyNames.get(String(row.propertyId)) || "Property",
        period: String(row.period || ""), error: String(row.error || "Invoice generation failed"), updatedAt: row.updatedAt,
      })),
    },
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

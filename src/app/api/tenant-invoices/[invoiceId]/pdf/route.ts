import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { addInvoicePaymentStates, getPriorInvoiceOutstandingMinor, invoiceItemsForDisplay, validObjectId } from "@/lib/tenant-invoices";
import { generateTenantInvoicePdf } from "@/lib/tenant-invoice-pdf";
import { resolveOwnerTenantMpesaRouting } from "@/lib/mpesa-routing";

export async function GET(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(userId) || !validObjectId(invoiceId)) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const { db } = await connectToDatabase();
  const invoice = await db.collection("tenantInvoices").findOne({ _id: new ObjectId(invoiceId) });
  if (!invoice || invoice.status !== "issued") return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  if (role === "tenant") {
    if (invoice.tenantId !== userId) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  } else if (role === "propertyOwner" || role === "teamMember") {
    let landlordId = userId;
    if (role === "teamMember") {
      const ownerId = request.cookies.get("ownerId")?.value || "";
      const member = ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
      if (!member || !Array.isArray(member.assignedPropertyIds) || !member.assignedPropertyIds.map(String).includes(String(invoice.propertyId))) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      const permissions = Array.isArray(member.permissions) ? member.permissions : [];
      if (!permissions.includes("payments:view") && !permissions.includes("reports:view") && !permissions.includes("tenants:view")) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      landlordId = ownerId;
    }
    if (invoice.landlordId !== landlordId) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  } else return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(invoice.tenantId) });
  const property = await db.collection("properties").findOne({ _id: new ObjectId(invoice.propertyId) });
  const landlord = await db.collection("propertyOwners").findOne({ _id: new ObjectId(invoice.landlordId) });
  const billingSettings = await db.collection("landlordBillingSettings").findOne({ landlordId: invoice.landlordId });
  const [financial] = await addInvoicePaymentStates(db, [invoice]);
  const previousOutstandingMinor = await getPriorInvoiceOutstandingMinor(db, invoice);
  let paymentInstructions = "Use the payment method agreed with your property manager.";
  try {
    const route = await resolveOwnerTenantMpesaRouting(db, { landlordId: invoice.landlordId, propertyId: invoice.propertyId });
    paymentInstructions = route.paymentType === "bank"
      ? `Bank: ${route.bank || "Configured bank"}\nAccount: ${route.bankAccount || "Contact property manager"}`
      : `${route.paymentType === "till" ? "M-Pesa Till" : "M-Pesa Paybill"}: ${route.shortcode}\nAccount/reference: ${invoice.invoiceNumber}`;
  } catch { /* omit unavailable destinations */ }
  const { pdfBytes } = await generateTenantInvoicePdf({
    invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate, billingPeriod: invoice.billingPeriodLabel || invoice.billingPeriod, status: financial?.status || invoice.status,
    tenantName: tenant?.name || invoice.tenantName, tenantEmail: tenant?.email, propertyName: property?.name || invoice.propertyName,
    propertyAddress: property?.address, unitLabel: invoice.unitLabel, items: invoiceItemsForDisplay(invoice), totalMinor: financial?.totalMinor ?? invoice.totalMinor,
    amountPaidMinor: financial?.amountPaidMinor || 0, previousOutstandingMinor, creditsAndAdjustmentsMinor: (invoice.adjustments || []).reduce((sum: number, row: any) => sum + Number(row.amountMinor || 0), 0),
    landlordName: landlord?.name, landlordEmail: landlord?.email, landlordPhone: landlord?.phone,
    brandName: billingSettings?.invoiceBrandName, brandColor: billingSettings?.invoiceBrandColor, paymentInstructions,
  });
  return new NextResponse(Buffer.from(pdfBytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`, "Cache-Control": "private, no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getMpesaCallbackUrl, initiateStkPush, isStkPushAccepted, isValidKenyanMsisdn, normalizePhoneNumber, resolveDarajaPlatformStkCredentials } from "@/lib/mpesa";
import { getOwnerInvoicePaymentProvider } from "@/lib/owner-integrations";

const Schema = z.object({ invoiceId: z.string().trim().refine(ObjectId.isValid), phone: z.string().trim().min(7) });

export async function POST(request: NextRequest) {
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await validateCsrfToken(request, csrf))) return buildInvalidCsrfResponse(request);
  const ownerId = request.cookies.get("userId")?.value;
  if (!ownerId || request.cookies.get("role")?.value !== "propertyOwner") return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid invoice payment request" }, { status: 400 });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!isValidKenyanMsisdn(phone)) return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
  try {
    const { db } = await connectToDatabase();
    const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(parsed.data.invoiceId), userId: ownerId });
    if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    const assignedProvider = invoice.paymentProvider || await getOwnerInvoicePaymentProvider(db, ownerId);
    if (String(assignedProvider).toLowerCase() !== "daraja") return NextResponse.json({ success: false, message: "Daraja is not the provider assigned to this invoice", provider: assignedProvider }, { status: 409 });
    if (!invoice.paymentProvider) await db.collection("invoices").updateOne({ _id: invoice._id }, { $set: { paymentProvider: assignedProvider, updatedAt: new Date() } });
    const amount = Number(invoice?.amount || 0);
    if (invoice.status !== "pending") return NextResponse.json({ success: false, message: "Invoice is no longer payable" }, { status: 409 });
    if (!Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ success: false, message: "Invoice amount is invalid" }, { status: 400 });
    const reference = String(invoice.reference || `INV-${invoice._id}`).trim();
    const existing = await db.collection("payments").findOne({ invoiceId: invoice._id.toString(), paymentRail: "property_owner_invoice_daraja", status: { $in: ["pending", "processing"] } });
    if (existing) return NextResponse.json({ success: true, checkoutRequestId: existing.checkoutRequestId, merchantRequestId: existing.merchantRequestId, status: existing.status, message: "A payment request is already pending." });
    const credentials = resolveDarajaPlatformStkCredentials();
    const callbackUrl = getMpesaCallbackUrl("/api/owner/invoice-payments/daraja-callback");
    const response = await initiateStkPush({ ...credentials, environment: undefined, amount, phone, accountReference: reference, transactionDesc: `Sorana invoice ${reference}`, callbackUrl, transactionType: "CustomerPayBillOnline", partyB: credentials.shortcode });
    if (!isStkPushAccepted(response)) return NextResponse.json({ success: false, message: response.ResponseDescription || "Payment initiation failed" }, { status: 502 });
    const now = new Date().toISOString();
    await db.collection("payments").insertOne({ invoiceId: invoice._id.toString(), ownerId, propertyOwnerId: ownerId, amount, currency: "KES", provider: "daraja", paymentRail: "property_owner_invoice_daraja", phoneNumber: phone, accountReference: reference, transactionId: response.CheckoutRequestID, checkoutRequestId: response.CheckoutRequestID, merchantRequestId: response.MerchantRequestID, status: "pending", resultCode: null, rawCallbackData: null, createdAt: now, updatedAt: now });
    return NextResponse.json({ success: true, provider: "daraja", status: "pending", checkoutRequestId: response.CheckoutRequestID, merchantRequestId: response.MerchantRequestID, message: response.CustomerMessage || "STK Push sent. Check your phone and enter your M-Pesa PIN." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Payment initiation failed" }, { status: 500 });
  }
}

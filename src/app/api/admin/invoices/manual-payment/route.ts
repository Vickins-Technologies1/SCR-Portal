import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { calculateInvoiceFinancialState } from "@/lib/financial-reporting";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";

const METHODS = ["mpesa_paybill", "mpesa_till", "bank_transfer", "cash", "other"] as const;
const REFERENCE_OPTIONAL_METHODS = new Set(["cash"]);
const cents = (value: number) => Math.round(value * 100);

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:manage");
  if (auth instanceof NextResponse) return auth;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);

  try {
    const body = await request.json();
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
    const method = typeof body.method === "string" ? body.method : "";
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const amount = Number(body.amount);
    const paymentDate = typeof body.paymentDate === "string" ? new Date(body.paymentDate) : null;

    if (!ObjectId.isValid(invoiceId) || !/^[0-9a-f-]{36}$/i.test(idempotencyKey) || !METHODS.includes(method as typeof METHODS[number])) {
      return NextResponse.json({ success: false, message: "Invalid invoice or payment details." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0 || !paymentDate || Number.isNaN(paymentDate.getTime())) {
      return NextResponse.json({ success: false, message: "Enter a valid amount and payment date." }, { status: 400 });
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      return NextResponse.json({ success: false, message: "Payment amount can have at most two decimal places." }, { status: 400 });
    }
    if (paymentDate.getTime() > Date.now()) return NextResponse.json({ success: false, message: "Payment date cannot be in the future." }, { status: 400 });
    if (!REFERENCE_OPTIONAL_METHODS.has(method) && !reference) {
      return NextResponse.json({ success: false, message: "A payment reference is required for this method." }, { status: 400 });
    }
    if (reference && !/^[\p{L}\p{N} ._/#-]+$/u.test(reference)) {
      return NextResponse.json({ success: false, message: "The payment reference contains unsupported characters." }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const paymentId = `admin-manual:${idempotencyKey}`;
    const existingRequest = await db.collection("payments").findOne({ paymentId });
    if (existingRequest) {
      if (existingRequest.adminPaymentRecordedBy !== auth.userId || existingRequest.invoiceId !== invoiceId) {
        return NextResponse.json({ success: false, message: "This payment request has already been used." }, { status: 409 });
      }
      if (existingRequest.financialPostingStatus === "posted" || existingRequest.financialEffectsApplied === true) {
        return NextResponse.json({ success: true, message: "Payment was already recorded.", invoiceId, status: existingRequest.invoiceStatusAfter || "PARTIALLY PAID" });
      }
      await postVerifiedPayment({ db, paymentId: existingRequest._id });
      const recovered = await db.collection("payments").findOne({ paymentId }, { projection: { financialPostingStatus: 1, financialEffectsApplied: 1 } });
      if (recovered?.financialPostingStatus !== "posted" && recovered?.financialEffectsApplied !== true) {
        return NextResponse.json({ success: false, message: "This payment needs review before another attempt." }, { status: 409 });
      }
      return NextResponse.json({ success: true, message: "Manual payment posting recovered.", invoiceId });
    }

    const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found." }, { status: 404 });
    const ownerId = String(invoice.userId || invoice.ownerId || "");
    const owner = ObjectId.isValid(ownerId) ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) }, { projection: { name: 1, email: 1 } }) : null;
    if (!owner) return NextResponse.json({ success: false, message: "Invoice owner could not be verified." }, { status: 409 });

    const calculation = await calculateInvoiceFinancialState(db, invoice);
    const referenceKey = reference.toLocaleUpperCase("en-US");
    if (referenceKey) {
      const duplicate = await db.collection("payments").findOne({
        $or: [{ adminPaymentReferenceKey: referenceKey }, { mpesaCode: referenceKey }],
      });
      if (duplicate) {
        const sameManualReceipt = duplicate.paymentRail === "property_owner_invoice_manual"
          && String(duplicate.invoiceId) === invoiceId
          && cents(Number(duplicate.amount)) === cents(amount)
          && duplicate.paymentMethod === method
          && new Date(duplicate.paymentDate).getTime() === paymentDate.getTime();
        if (sameManualReceipt && duplicate.financialPostingStatus !== "quarantined") {
          if (duplicate.financialPostingStatus !== "posted" && duplicate.financialEffectsApplied !== true) {
            await postVerifiedPayment({ db, paymentId: duplicate._id });
          }
          const recovered = await db.collection("payments").findOne({ _id: duplicate._id });
          if (recovered?.financialPostingStatus === "posted" || recovered?.financialEffectsApplied === true) {
            const currentInvoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
            const currentState = currentInvoice ? await calculateInvoiceFinancialState(db, currentInvoice) : null;
            await db.collection("payments").updateOne(
              { _id: duplicate._id },
              { $set: { invoiceStatusAfter: currentState?.status || "UNKNOWN", auditUpdatedAt: new Date().toISOString() } },
            );
            return NextResponse.json({ success: true, message: "This payment had already been recorded and is now confirmed.", invoiceId, status: currentState?.status });
          }
          return NextResponse.json({ success: false, message: "This payment reference is already attached to a receipt that needs review. Contact support before recording it again." }, { status: 409 });
        }
        return NextResponse.json({ success: false, message: "That payment reference has already been recorded." }, { status: 409 });
      }
    }

    if (calculation.balanceDue <= 0) return NextResponse.json({ success: false, message: "This invoice is already fully paid." }, { status: 409 });
    if (cents(amount) > cents(calculation.balanceDue)) return NextResponse.json({ success: false, message: "The payment exceeds the current outstanding balance." }, { status: 400 });

    const now = new Date().toISOString();
    const paymentObjectId = new ObjectId();
    const paymentDocument = {
      _id: paymentObjectId,
      paymentId,
      invoiceId,
      ownerId,
      propertyOwnerId: ownerId,
      landlordId: ownerId,
      propertyId: String(invoice.propertyId || ""),
      amount,
      requestedAmount: amount,
      currency: "KES",
      provider: "admin_manual",
      paymentRail: "property_owner_invoice_manual",
      paymentMethod: method,
      reference: reference || null,
      ...(referenceKey ? { adminPaymentReferenceKey: referenceKey } : {}),
      type: "property_owner_invoice",
      status: "completed",
      financialPostingStatus: "pending",
      paymentDate: paymentDate.toISOString(),
      createdAt: now,
      updatedAt: now,
      adminPaymentRecordedBy: auth.userId,
      adminPaymentNote: note || null,
      invoiceNumber: invoice.reference || invoice.invoiceNumber || String(invoice._id),
      invoiceAmount: calculation.total,
      invoiceAmountPaidBefore: calculation.amountPaid,
      invoiceBalanceBefore: calculation.balanceDue,
      invoiceStatusBefore: calculation.status,
    };

    await db.collection("payments").insertOne(paymentDocument);
    const posting = await postVerifiedPayment({ db, paymentId: paymentObjectId, providerConfirmedAmount: amount });
    const recordedPayment = await db.collection("payments").findOne({ paymentId }, { projection: { financialPostingStatus: 1, financialEffectsApplied: 1 } });
    if (posting.outcome !== "posted" && recordedPayment?.financialPostingStatus !== "posted" && recordedPayment?.financialEffectsApplied !== true) {
      return NextResponse.json({ success: false, message: "The payment could not be safely posted. Contact support before retrying." }, { status: 409 });
    }
    const refreshedInvoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
    const finalCalculation = refreshedInvoice ? await calculateInvoiceFinancialState(db, refreshedInvoice) : null;
    await db.collection("payments").updateOne(
      { paymentId },
      { $set: { invoiceStatusAfter: finalCalculation?.status || "UNKNOWN", auditUpdatedAt: new Date().toISOString() } },
    );

    return NextResponse.json({
      success: true,
      message: "Manual payment recorded.",
      invoiceId,
      status: finalCalculation?.status || "UNKNOWN",
      amountPaid: finalCalculation?.amountPaid ?? calculation.amountPaid + amount,
      balanceDue: finalCalculation?.balanceDue ?? Math.max(0, calculation.balanceDue - amount),
    });
  } catch (error) {
    // Database and provider internals are intentionally kept out of client responses.
    console.error("Admin manual invoice payment failed", { message: error instanceof Error ? error.message : String(error) });
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return NextResponse.json({ success: false, message: "That payment reference or request has already been recorded." }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: "Unable to record this payment. Please refresh and try again." }, { status: 500 });
  }
}

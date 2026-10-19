import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { createPaymentReversal } from "@/lib/financial-ledger";
import { isSuccessfulPaymentStatus, paymentAmount } from "@/lib/payment-query";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";

const REVERSAL_REASONS = new Set([
  "Incorrect amount",
  "Wrong tenant",
  "Wrong property or unit",
  "Duplicate manual entry",
  "Payment was not received",
  "Incorrect payment date or reference",
  "Other",
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(paymentId) || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized or invalid payment" }, { status: 401 });
  }
  const csrf = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrf)) return buildInvalidCsrfResponse(request);

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 }); }
  const reasonCode = String(body?.reason || "").trim();
  const note = String(body?.note || "").replace(/[<>\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!REVERSAL_REASONS.has(reasonCode) || (reasonCode === "Other" && !note)) {
    return NextResponse.json({ success: false, message: "Choose a correction reason and provide a note for Other." }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  let payment = await db.collection("payments").findOne({ _id: new ObjectId(paymentId) });
  if (!payment) return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
  const member = role === "teamMember"
    ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), active: true })
    : null;
  const ownerId = role === "teamMember" ? String(member?.ownerId || "") : userId;
  const propertyId = String(payment.propertyId || "");
  const property = ObjectId.isValid(propertyId)
    ? await db.collection("properties").findOne({ _id: new ObjectId(propertyId) })
    : null;
  const permissions: string[] = Array.isArray(member?.permissions) ? member.permissions : [];
  const assignedPropertyIds: string[] | null = Array.isArray(member?.assignedPropertyIds)
    ? member.assignedPropertyIds.map((id: unknown) => String(id))
    : null;
  const permitted = role === "propertyOwner" || permissions.includes("payments:record");
  if ((!member && role === "teamMember") || !property || String(property.ownerId) !== ownerId || !permitted || (assignedPropertyIds?.length && !assignedPropertyIds.includes(propertyId))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  if (!payment.tenantId || !ObjectId.isValid(String(payment.tenantId))) {
    return NextResponse.json({ success: false, message: "Payment tenant relationship is missing or invalid." }, { status: 409 });
  }
  if (payment.tenantId) {
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(String(payment.tenantId)) }, { projection: { propertyId: 1 } });
    if (!tenant || String(tenant.propertyId) !== propertyId) {
      return NextResponse.json({ success: false, message: "Payment tenant and property do not match." }, { status: 409 });
    }
  }

  // Origin is determined from the server-created transaction identifier; the request
  // body cannot classify a provider payment as manual.
  const transactionId = String(payment.transactionId || "");
  const providerTransactionId = String(payment.providerTransactionId || "");
  if (!transactionId.startsWith("MANUAL-") || payment.provider || (providerTransactionId && providerTransactionId !== transactionId)) {
    return NextResponse.json({ success: false, message: "Only manually recorded payments can be reversed here." }, { status: 409 });
  }

  const idempotencyKey = `manual-payment:${paymentId}`;
  const priorRequest = await db.collection("financialLedger").findOne({ eventKey: `reversal:${idempotencyKey}` });
  if (priorRequest?.status === "posted") {
    try {
      // The ledger event may have posted before a later projection write failed.
      // Replaying the idempotent operation also reruns tenant/invoice reconciliation.
      const reversal = await createPaymentReversal({
        db,
        paymentId,
        amount: paymentAmount(payment),
        reason: String(priorRequest.reason || "Manual payment correction"),
        actorId: userId,
        actorRole: role,
        idempotencyKey,
        providerReference: payment.reference || payment.mpesaCode || payment.transactionId || null,
      });
      return NextResponse.json({ success: true, reversal }, { status: 200 });
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Reconciliation retry failed" }, { status: 409 });
    }
  }
  if (priorRequest?.status === "rejected") {
    return NextResponse.json({ success: false, message: priorRequest.rejectionReason || "This reversal was rejected." }, { status: 409 });
  }
  if (priorRequest?.status === "processing") {
    const ageMs = Date.now() - new Date(priorRequest.createdAt || 0).getTime();
    if (ageMs >= 0 && ageMs < 5 * 60 * 1000) {
      return NextResponse.json({ success: false, message: "A reversal for this payment is already processing. Refresh shortly." }, { status: 409 });
    }
  }
  // A successful manual receipt can be left in pending/processing when the
  // original request is interrupted after recording it. Replay the shared,
  // idempotent posting flow before attempting a reversal; never set the posted
  // marker directly here.
  if (
    isSuccessfulPaymentStatus(payment.status) &&
    payment.status === "completed" &&
    payment.financialPostingStatus !== "posted"
  ) {
    try {
      const posting = await postVerifiedPayment({
        db,
        paymentId: payment._id,
        providerConfirmedAmount: payment.postedAmount ?? payment.providerConfirmedAmount ?? payment.amount,
        providerTransactionId: transactionId,
      });
      payment = await db.collection("payments").findOne({ _id: payment._id }) || payment;
      if (posting.outcome === "quarantined") {
        return NextResponse.json({ success: false, message: posting.reason }, { status: 409 });
      }
    } catch {
      return NextResponse.json({
        success: false,
        message: "Payment posting recovery failed. Contact support for review.",
      }, { status: 409 });
    }
  }

  if (!isSuccessfulPaymentStatus(payment.status) || payment.financialPostingStatus !== "posted") {
    return NextResponse.json({
      success: false,
      message: payment.financialPostingStatus === "processing"
        ? "Payment posting is still processing. Refresh and retry shortly; contact support if it remains in this state."
        : "This payment could not be posted for reversal and needs review.",
    }, { status: 409 });
  }
  const existingReversal = await db.collection("financialLedger").findOne({
    kind: "PAYMENT_REVERSED",
    status: { $in: ["processing", "posted"] },
    sourcePaymentId: { $in: [payment._id, paymentId] },
  });
  if (existingReversal && existingReversal.status === "posted") {
    return NextResponse.json({ success: false, message: "This payment has already been reversed." }, { status: 409 });
  }

  try {
    const reversal = await createPaymentReversal({
      db,
      paymentId,
      amount: paymentAmount(payment),
      reason: reasonCode === "Other" ? `${reasonCode}: ${note}` : note ? `${reasonCode}: ${note}` : reasonCode,
      actorId: userId,
      actorRole: role,
      idempotencyKey,
      providerReference: payment.reference || payment.mpesaCode || payment.transactionId || null,
    });
    return NextResponse.json({ success: true, reversal }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Reversal failed" }, { status: 409 });
  }
}

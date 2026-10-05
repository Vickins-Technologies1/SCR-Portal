import { randomUUID } from "node:crypto";
import { Db, ObjectId } from "mongodb";
import { calculateInvoiceTotals } from "@/lib/invoice-calculations";
import { reconcileTenantPaymentAllocation } from "@/lib/tenant-payment-allocation";

export type VerifiedPaymentPostingResult =
  | { outcome: "posted"; payment: any; tenantState?: any; invoice?: any }
  | { outcome: "duplicate"; payment: any }
  | { outcome: "quarantined"; payment: any; reason: string };

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sameAmount(left: unknown, right: unknown): boolean {
  const a = numeric(left);
  const b = numeric(right);
  return a !== null && b !== null && Math.round(a * 100) === Math.round(b * 100);
}

async function quarantine(db: Db, payment: any, reason: string): Promise<VerifiedPaymentPostingResult> {
  const now = new Date().toISOString();
  await db.collection("payments").updateOne(
    { _id: payment._id, financialPostingStatus: { $ne: "posted" } },
    {
      $set: {
        financialPostingStatus: "quarantined",
        financialReviewReason: reason,
        updatedAt: now,
      },
    },
  );
  return { outcome: "quarantined", payment: { ...payment, financialPostingStatus: "quarantined" }, reason };
}

async function reconcileInvoice(db: Db, invoiceId: string) {
  if (!ObjectId.isValid(invoiceId)) return null;
  const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) });
  if (!invoice) return null;
  const payments = await db.collection("payments").find({
    invoiceId,
    status: "completed",
    $or: [
      { financialPostingStatus: { $in: ["posted", "processing"] } },
      { financialPostingStatus: { $exists: false } },
    ],
  }).project({ amount: 1 }).toArray();
  const amountPaid = payments.reduce((sum, payment) => sum + (numeric(payment.amount) || 0), 0);
  const calculation = calculateInvoiceTotals({
    amount: Number(invoice.amount || 0),
    items: invoice.items,
    discount: invoice.discount,
    tax: invoice.tax,
    amountPaid,
    dueDate: invoice.dueDate || invoice.expiresAt,
  });
  await db.collection("invoices").updateOne(
    { _id: invoice._id },
    {
      $set: {
        amountPaid: calculation.amountPaid,
        balanceDue: calculation.balanceDue,
        status: calculation.status,
        paidAt: calculation.status === "PAID" ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      },
    },
  );
  return { ...invoice, ...calculation };
}

/**
 * The single application-side financial posting boundary. Provider handlers
 * may identify and validate a provider event, but only this function may mark
 * a successful payment as financially posted.
 */
export async function postVerifiedPayment(params: {
  db: Db;
  paymentId: ObjectId | string;
  providerConfirmedAmount?: number | string | null;
  providerTransactionId?: string | null;
  providerReceipt?: string | null;
  allowRequestedAmountMismatch?: boolean;
}): Promise<VerifiedPaymentPostingResult> {
  const paymentObjectId = params.paymentId instanceof ObjectId ? params.paymentId : new ObjectId(String(params.paymentId));
  const payment = await params.db.collection("payments").findOne({ _id: paymentObjectId });
  if (!payment) throw new Error("Payment not found");

  if (payment.financialPostingStatus === "posted" || payment.financialEffectsApplied === true) {
    return { outcome: "duplicate", payment };
  }

  const providerAmount = numeric(params.providerConfirmedAmount ?? payment.providerConfirmedAmount ?? payment.amount);
  if (providerAmount === null) return quarantine(params.db, payment, "Provider-confirmed amount is missing or invalid.");

  if (!params.allowRequestedAmountMismatch && payment.requestedAmount != null && !sameAmount(payment.requestedAmount, providerAmount)) {
    return quarantine(params.db, payment, `Requested amount ${payment.requestedAmount} differs from provider amount ${providerAmount}.`);
  }

  if (payment.tenantId) {
    if (!ObjectId.isValid(String(payment.tenantId)) || !ObjectId.isValid(String(payment.propertyId))) {
      return quarantine(params.db, payment, "Payment has invalid tenant or property identity.");
    }
    const tenant = await params.db.collection("tenants").findOne({ _id: new ObjectId(String(payment.tenantId)) });
    const property = await params.db.collection("properties").findOne({ _id: new ObjectId(String(payment.propertyId)) });
    if (!tenant || !property || String(tenant.propertyId) !== String(payment.propertyId)) {
      return quarantine(params.db, payment, "Tenant/property relationship is inconsistent.");
    }
    if (payment.landlordId && String(payment.landlordId) !== String(property.ownerId)) {
      return quarantine(params.db, payment, "Payment landlord does not own the tenant property.");
    }
  }

  const duplicateIdentity: Record<string, unknown>[] = [];
  const providerTransactionId = String(params.providerTransactionId || payment.providerTransactionId || "").trim();
  const providerReceipt = String(params.providerReceipt || payment.mpesaCode || "").trim();
  if (providerTransactionId) duplicateIdentity.push({ providerTransactionId });
  if (providerReceipt) duplicateIdentity.push({ mpesaCode: providerReceipt });
  if (duplicateIdentity.length) {
    const duplicate = await params.db.collection("payments").findOne({
      _id: { $ne: payment._id },
      provider: payment.provider,
      $or: duplicateIdentity,
      financialPostingStatus: "posted",
    });
    if (duplicate) return { outcome: "duplicate", payment: duplicate };
  }

  const claimToken = randomUUID();
  const claimed = await params.db.collection("payments").findOneAndUpdate(
    {
      _id: payment._id,
      status: "completed",
      financialPostingStatus: { $nin: ["posted", "processing"] },
      financialEffectsApplied: { $ne: true },
    },
    {
      $set: {
        providerConfirmedAmount: providerAmount,
        postedAmount: providerAmount,
        ...(providerTransactionId ? { providerTransactionId } : {}),
        ...(providerReceipt ? { mpesaCode: providerReceipt } : {}),
        financialPostingStatus: "processing",
        financialPostingClaim: claimToken,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );
  if (!claimed?.value) return { outcome: "duplicate", payment };

  const claimedPayment = claimed.value;
  let tenantState;
  if (claimedPayment.tenantId) {
    tenantState = await reconcileTenantPaymentAllocation(params.db, String(claimedPayment.tenantId));
  }
  const invoice = claimedPayment.invoiceId ? await reconcileInvoice(params.db, String(claimedPayment.invoiceId)) : null;

  const posted = await params.db.collection("payments").findOneAndUpdate(
    { _id: paymentObjectId, financialPostingClaim: claimToken, financialPostingStatus: "processing" },
    {
      $set: {
        financialPostingStatus: "posted",
        financialEffectsApplied: true,
        postedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );
  return { outcome: "posted", payment: posted?.value || claimedPayment, tenantState, invoice };
}

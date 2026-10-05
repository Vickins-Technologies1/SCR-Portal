import { Db, ObjectId } from "mongodb";
import { reconcileTenantPaymentAllocation } from "@/lib/tenant-payment-allocation";
import { reconcileInvoiceFinancialState } from "@/lib/financial-reporting";

export type FinancialLedgerKind = "PAYMENT_POSTED" | "PAYMENT_REVERSED";
export type WalletLedgerKind = "PAYMENT_CREDIT" | "CREDIT_CONSUMED" | "CREDIT_RESTORED" | "CREDIT_REVERSED" | "MANUAL_ADJUSTMENT";

const asAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
};

export function calculateReversalAllocation(allocation: Record<string, unknown> | null | undefined, originalAmount: number, reversalAmount: number) {
  const ratio = originalAmount > 0 ? Math.min(1, reversalAmount / originalAmount) : 0;
  return {
    rent: asAmount(asAmount(allocation?.rent) * ratio),
    utilities: asAmount(asAmount(allocation?.utilities) * ratio),
    deposit: asAmount(asAmount(allocation?.deposit) * ratio),
    other: asAmount(asAmount(allocation?.other) * ratio),
    credit: asAmount(asAmount(allocation?.walletCredit) * ratio),
  };
}

export async function recordPostedPaymentLedger(db: Db, payment: any) {
  const amount = asAmount(payment.postedAmount ?? payment.amount);
  const allocation = payment.allocation || {};
  const event = {
    eventKey: `payment:${String(payment._id)}:posted`,
    kind: "PAYMENT_POSTED" as const,
    amount,
    tenantId: payment.tenantId || null,
    propertyId: payment.propertyId || null,
    landlordId: payment.landlordId || payment.ownerId || null,
    unitId: payment.unitId || null,
    sourcePaymentId: payment._id,
    provider: payment.provider || null,
    providerTransactionId: payment.providerTransactionId || payment.transactionId || null,
    providerReference: payment.mpesaCode || payment.reference || null,
    allocation: {
      rent: asAmount(allocation.rent),
      utilities: asAmount(allocation.utilities),
      deposit: asAmount(allocation.deposit),
      other: asAmount(allocation.other),
      credit: asAmount(allocation.walletCredit),
    },
    billingPeriod: payment.utilityBillingPeriod || null,
    actorId: payment.operatorId || null,
    actorRole: payment.operatorRole || "system",
    occurredAt: payment.postedAt || payment.paymentDate || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  await db.collection("financialLedger").updateOne(
    { eventKey: event.eventKey },
    { $setOnInsert: event },
    { upsert: true },
  );
  if (event.allocation.credit > 0 && payment.tenantId) {
    await db.collection("walletTransactions").updateOne(
      { eventKey: `payment:${String(payment._id)}:credit` },
      {
        $setOnInsert: {
          eventKey: `payment:${String(payment._id)}:credit`,
          kind: "PAYMENT_CREDIT" as const,
          direction: "CREDIT",
          amount: event.allocation.credit,
          tenantId: payment.tenantId,
          propertyId: payment.propertyId || null,
          sourcePaymentId: payment._id,
          reference: payment.providerTransactionId || payment.transactionId || null,
          reason: "Unapplied payment credit",
          actorId: payment.operatorId || null,
          actorRole: payment.operatorRole || "system",
          createdAt: event.createdAt,
        },
      },
      { upsert: true },
    );
  }
  return event;
}

export async function getPaymentReversalTotal(db: Db, paymentId: ObjectId | string) {
  const rows = await db.collection("financialLedger").aggregate<{ total: number }>([
    { $match: { kind: "PAYMENT_REVERSED", sourcePaymentId: paymentId instanceof ObjectId ? paymentId : new ObjectId(String(paymentId)), status: "posted" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).toArray();
  return asAmount(rows[0]?.total);
}

export async function createPaymentReversal(params: {
  db: Db;
  paymentId: ObjectId | string;
  amount: number;
  reason: string;
  actorId: string;
  actorRole: string;
  idempotencyKey: string;
  providerReference?: string | null;
}) {
  const db = params.db;
  const paymentId = params.paymentId instanceof ObjectId ? params.paymentId : new ObjectId(String(params.paymentId));
  const amount = asAmount(params.amount);
  if (!amount || !params.reason.trim() || !params.idempotencyKey.trim()) throw new Error("Invalid reversal request");

  const reversalKey = `reversal:${params.idempotencyKey}`;

  const reservation = await db.collection("financialLedger").updateOne(
    { eventKey: reversalKey },
    {
      $setOnInsert: {
        eventKey: reversalKey,
        kind: "PAYMENT_REVERSED" as const,
        status: "processing",
        amount,
        sourcePaymentId: paymentId,
        reason: params.reason.trim(),
        actorId: params.actorId,
        actorRole: params.actorRole,
        providerReference: params.providerReference || null,
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  let existingReservation: any = null;
  if (!reservation.upsertedCount) {
    existingReservation = await db.collection("financialLedger").findOne({ eventKey: reversalKey });
    if (!existingReservation) throw new Error("Reversal reservation disappeared");
    if (existingReservation.status === "posted" || existingReservation.status === "rejected") {
      const existingPayment = await db.collection("payments").findOne({ _id: paymentId });
      if (existingPayment?.tenantId) await reconcileTenantPaymentAllocation(db, String(existingPayment.tenantId));
      if (existingPayment?.invoiceId) await reconcileInvoiceFinancialState(db, String(existingPayment.invoiceId));
      return existingReservation;
    }
    const reservationAge = existingReservation.createdAt
      ? Date.now() - new Date(existingReservation.createdAt).getTime()
      : 0;
    if (reservationAge >= 0 && reservationAge < 5 * 60 * 1000) return existingReservation;
  }

  const payment = await db.collection("payments").findOne({ _id: paymentId });
  if (!payment || payment.status !== "completed") {
    await db.collection("financialLedger").updateOne(
      { eventKey: reversalKey, status: "processing" },
      { $set: { status: "rejected", rejectionReason: "Only completed payments can be reversed", updatedAt: new Date().toISOString() } },
    );
    throw new Error("Only completed payments can be reversed");
  }
  const originalAmount = asAmount(payment.postedAmount ?? payment.amount);
  if (!existingReservation?.reservedAt) {
    const reserve = await db.collection("payments").updateOne(
      {
        _id: paymentId,
        reversalReservationKeys: { $ne: params.idempotencyKey },
        $or: [
          { reversalReservedAmount: { $exists: false } },
          { reversalReservedAmount: { $lte: originalAmount - amount } },
        ],
      },
      {
        $inc: { reversalReservedAmount: amount },
        $addToSet: { reversalReservationKeys: params.idempotencyKey },
      },
    );
    if (!reserve.modifiedCount) {
      const reservedPayment = await db.collection("payments").findOne({ _id: paymentId, reversalReservationKeys: params.idempotencyKey });
      if (!reservedPayment) {
        await db.collection("financialLedger").updateOne(
          { eventKey: reversalKey, status: "processing" },
          { $set: { status: "rejected", rejectionReason: "Reversal exceeds remaining reversible amount", updatedAt: new Date().toISOString() } },
        );
        throw new Error("Reversal exceeds remaining reversible amount");
      }
    }
    await db.collection("financialLedger").updateOne(
      { eventKey: reversalKey, status: "processing" },
      { $set: { reservedAt: new Date().toISOString() } },
    );
  }

  const reversedAllocation = calculateReversalAllocation(payment.allocation, originalAmount, amount);
  const updated = await db.collection("financialLedger").updateOne(
    { eventKey: reversalKey, status: "processing" },
    { $set: { status: "posted", allocation: reversedAllocation, postedAt: new Date().toISOString() } },
  );
  if (!updated.modifiedCount) {
    const existing = await db.collection("financialLedger").findOne({ eventKey: reversalKey });
    if (existing?.status === "posted") {
      if (payment.tenantId) await reconcileTenantPaymentAllocation(db, String(payment.tenantId));
      if (payment.invoiceId) await reconcileInvoiceFinancialState(db, String(payment.invoiceId));
    }
    return existing;
  }

  if (reversedAllocation.credit > 0 && payment.tenantId) {
    await db.collection("walletTransactions").updateOne(
      { eventKey: `${reversalKey}:credit` },
      { $setOnInsert: {
        eventKey: `${reversalKey}:credit`,
        kind: "CREDIT_REVERSED" as const,
        direction: "DEBIT",
        amount: reversedAllocation.credit,
        tenantId: payment.tenantId,
        propertyId: payment.propertyId || null,
        sourcePaymentId: paymentId,
        sourceReversalKey: params.idempotencyKey,
        reason: "Payment reversal restored/reversed unapplied credit",
        actorId: params.actorId,
        actorRole: params.actorRole,
        createdAt: new Date().toISOString(),
      } },
      { upsert: true },
    );
  }
  if (payment.tenantId) await reconcileTenantPaymentAllocation(db, String(payment.tenantId));
  if (payment.invoiceId) await reconcileInvoiceFinancialState(db, String(payment.invoiceId));
  return db.collection("financialLedger").findOne({ eventKey: `reversal:${params.idempotencyKey}` });
}

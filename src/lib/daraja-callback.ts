import { randomUUID } from "node:crypto";
import type { Db, ObjectId } from "mongodb";
import { z } from "zod";

export const DarajaCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().trim().min(1),
      CheckoutRequestID: z.string().trim().min(1),
      // Safaricom normally sends a number, but some gateway/proxy payloads serialize it.
      ResultCode: z.coerce.number().int(),
      ResultDesc: z.coerce.string(),
      CallbackMetadata: z.object({
        Item: z.array(z.object({
          Name: z.string().trim().min(1),
          // Metadata values may be strings, numbers, null, or omitted depending on the result.
          Value: z.union([z.string(), z.number(), z.null()]).optional(),
        })),
      }).optional(),
    }),
  }),
});

export type DarajaCallback = z.infer<typeof DarajaCallbackSchema>["Body"]["stkCallback"];
export type DarajaCallbackStatus = "completed" | "cancelled" | "expired" | "timeout" | "failed";
type DarajaMetadataItem = { Name: string; Value?: string | number | null };

export function classifyDarajaResult(resultCode: number, resultDesc: string): DarajaCallbackStatus {
  if (resultCode === 0) return "completed";
  if (resultCode === 1032 || /cancel|request cancelled|user cancelled/i.test(resultDesc)) return "cancelled";
  if (resultCode === 1037 || /timeout|timed out|expired|did not respond/i.test(resultDesc)) return "timeout";
  return "failed";
}

export function extractDarajaMetadata(items?: DarajaMetadataItem[]) {
  const values = new Map<string, string | number>();
  for (const item of items || []) values.set(item.Name, item.Value ?? "");
  return {
    amount: Number(values.get("Amount") || 0),
    receipt: String(values.get("MpesaReceiptNumber") || ""),
    transactionDate: values.get("TransactionDate"),
    phone: String(values.get("PhoneNumber") || ""),
  };
}

/** Daraja transaction timestamps are local Kenya time in YYYYMMDDHHmmss form. */
export function parseDarajaTransactionDate(value?: string | number): Date | null {
  if (!value) return null;
  const text = String(value);
  if (!/^\d{14}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6)) - 1;
  const day = Number(text.slice(6, 8));
  const hour = Number(text.slice(8, 10));
  const minute = Number(text.slice(10, 12));
  const second = Number(text.slice(12, 14));
  const date = new Date(Date.UTC(year, month, day, hour - 3, minute, second));
  return Number.isNaN(date.getTime()) ? null : date;
}

function identifierQuery(callback: DarajaCallback) {
  return {
    $and: [
      { provider: { $in: ["daraja", "mpesa", null] } },
      { $or: [
        { checkoutRequestId: callback.CheckoutRequestID },
        { transactionId: callback.CheckoutRequestID },
        { merchantRequestId: callback.MerchantRequestID },
      ] },
    ],
  };
}

async function findPaymentWithRetry(db: Db, callback: DarajaCallback) {
  // The provider can callback immediately after returning the request IDs,
  // before the initiating request has finished persisting the payment.
  const delaysMs = [0, 100, 250, 500, 1000, 2000, 3000];
  for (const delayMs of delaysMs) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const payment = await db.collection("payments").findOne(identifierQuery(callback));
    if (payment) return payment;
  }
  return null;
}

export async function claimDarajaCallback(db: Db, callback: DarajaCallback) {
  const metadata = extractDarajaMetadata(callback.CallbackMetadata?.Item);
  const status = classifyDarajaResult(callback.ResultCode, callback.ResultDesc);
  const existing = await findPaymentWithRetry(db, callback);

  if (!existing) return { payment: null, metadata, status, shouldProcessEffects: false, reason: "not_found" as const };

  if (metadata.receipt) {
    const receiptOwner = await db.collection("payments").findOne({
      provider: "daraja",
      mpesaCode: metadata.receipt,
    }, { projection: { _id: 1 } });
    if (receiptOwner && String(receiptOwner._id) !== String(existing._id)) {
      return { payment: existing, metadata, status, shouldProcessEffects: false, reason: "receipt_replay" as const };
    }
  }

  if (existing.darajaEffectsApplied === true) {
    return { payment: existing, metadata, status, shouldProcessEffects: false, reason: "already_finalized" as const };
  }

  // A callback can be retried after the provider status was recorded but
  // before financial posting finished. Allow the durable posting boundary to
  // retry that work instead of treating the completed status as a terminal
  // callback claim.
  if (String(existing.status).toLowerCase() === "completed") {
    return {
      payment: existing,
      metadata,
      status,
      shouldProcessEffects: status === "completed" && existing.financialPostingStatus !== "posted" && existing.financialEffectsApplied !== true,
      reason: "retry" as const,
    };
  }

  const now = new Date();
  const claimed = await db.collection("payments").findOneAndUpdate(
    {
      _id: existing._id,
      darajaEffectsApplied: { $ne: true },
      status: { $nin: ["completed", "failed", "cancelled", "expired", "timeout", "reversed"] },
    },
    {
      $set: {
        provider: "daraja",
        status,
        resultCode: callback.ResultCode,
        resultDesc: callback.ResultDesc,
        updatedAt: now.toISOString(),
        callbackReceivedAt: now.toISOString(),
        darajaProcessingClaim: randomUUID(),
        ...(parseDarajaTransactionDate(metadata.transactionDate as string | number | undefined)
          ? { providerTransactionDate: parseDarajaTransactionDate(metadata.transactionDate as string | number | undefined)!.toISOString() }
          : {}),
        ...(status === "completed" && parseDarajaTransactionDate(metadata.transactionDate as string | number | undefined)
          ? { paymentDate: parseDarajaTransactionDate(metadata.transactionDate as string | number | undefined)!.toISOString() }
          : {}),
        ...(metadata.amount > 0 ? { providerConfirmedAmount: metadata.amount } : {}),
        ...(metadata.receipt ? { mpesaCode: metadata.receipt } : {}),
        ...(metadata.phone ? { phoneNumber: metadata.phone } : {}),
        ...(status === "completed" ? { completedAt: now.toISOString() } : {}),
      },
    },
    { returnDocument: "after" },
  );

  const payment = claimed?.value;
  return {
    payment,
    metadata,
    status,
    shouldProcessEffects: Boolean(payment && status === "completed"),
    reason: payment ? "claimed" as const : "duplicate" as const,
  };
}

export async function markDarajaEffectsApplied(db: Db, paymentId: ObjectId) {
  await db.collection("payments").updateOne(
    { _id: paymentId, darajaEffectsApplied: { $ne: true } },
    { $set: { darajaEffectsApplied: true, updatedAt: new Date().toISOString() } },
  );
}

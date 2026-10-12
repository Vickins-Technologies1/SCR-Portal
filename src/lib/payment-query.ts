import { ObjectId } from "mongodb";

export type PaymentIdentity = string | ObjectId;

/**
 * Payment records created by older releases used several successful status
 * values. These are the only values that may contribute to financial totals;
 * pending, failed, cancelled, expired, reversed, and quarantined records do
 * not qualify on status alone.
 */
export const SUCCESSFUL_PAYMENT_STATUSES = [
  "completed",
  "successful",
  "success",
  "paid",
  "settled",
] as const;

export const POSTED_PAYMENT_STATUSES = ["posted", "processing"] as const;

export function isSuccessfulPaymentStatus(value: unknown): boolean {
  return SUCCESSFUL_PAYMENT_STATUSES.includes(String(value || "").trim().toLowerCase() as (typeof SUCCESSFUL_PAYMENT_STATUSES)[number]);
}

export function identityValues(value: unknown): PaymentIdentity[] {
  const values = Array.isArray(value) ? value : [value];
  const result: PaymentIdentity[] = [];
  for (const item of values) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    if (!result.some((existing) => String(existing) === text)) result.push(text);
    if (ObjectId.isValid(text) && !result.some((existing) => existing instanceof ObjectId && existing.toString() === text)) {
      result.push(new ObjectId(text));
    }
  }
  return result;
}

export function identityFilter(field: string, value: unknown) {
  const identities = identityValues(value);
  return identities.length ? { [field]: { $in: identities } } : { [field]: { $exists: false } };
}

export function successfulPaymentFilter() {
  return { status: { $in: [...SUCCESSFUL_PAYMENT_STATUSES] } };
}

export function financialPostingFilter() {
  return {
    $or: [
      { financialPostingStatus: { $in: [...POSTED_PAYMENT_STATUSES, null] } },
      { financialPostingStatus: { $exists: false } },
      // A completed payment can be left with the initial `pending` posting
      // marker if the callback completed but the final posting update was
      // interrupted. If it has a provider-confirmed/posted amount (or its
      // ledger effects were already applied), it is still a real payment and
      // must not disappear from the tenant's due calculation.
      {
        financialPostingStatus: "pending",
        $or: [
          { postedAmount: { $exists: true, $ne: null } },
          { providerConfirmedAmount: { $exists: true, $ne: null } },
          { financialEffectsApplied: true },
        ],
      },
    ],
  };
}

export function eligibleFinancialPaymentFilter() {
  return {
    $and: [successfulPaymentFilter(), financialPostingFilter()],
  };
}

export function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function paymentAmount(payment: unknown): number {
  const record = payment && typeof payment === "object" ? (payment as Record<string, unknown>) : {};
  return Math.max(0, money(record.postedAmount ?? record.providerConfirmedAmount ?? record.amount));
}

export function paymentEventDate(payment: Record<string, unknown>): Date | null {
  for (const field of ["paymentDate", "providerTransactionDate", "completedAt", "paidAt", "createdAt"]) {
    const value = payment[field];
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function convertedDateExpression(field: string) {
  return { $convert: { input: `$${field}`, to: "date", onError: null, onNull: null } };
}

/** Mongo expression for the same event-date precedence used by reports. */
export function paymentEventDateExpression() {
  return ["paymentDate", "providerTransactionDate", "completedAt", "paidAt", "createdAt"]
    .map(convertedDateExpression)
    .reduceRight((fallback, current) => ({ $ifNull: [current, fallback] }), null as any);
}

export function paymentDateRangeFilter(start?: Date, end?: Date) {
  const conditions: any[] = [];
  const eventDate = paymentEventDateExpression();
  if (start) conditions.push({ $gte: [eventDate, start] });
  if (end) conditions.push({ $lte: [eventDate, end] });
  return conditions.length ? { $expr: { $and: conditions } } : null;
}

export function prorateAllocation(allocation: Record<string, unknown> | null | undefined, original: number, net: number) {
  const ratio = original > 0 ? Math.max(0, Math.min(1, net / original)) : 0;
  return {
    rent: money(money(allocation?.rent) * ratio),
    utilities: money(money(allocation?.utilities) * ratio),
    deposit: money(money(allocation?.deposit) * ratio),
    other: money(money(allocation?.other) * ratio),
    walletCredit: money(money(allocation?.walletCredit) * ratio),
  };
}

export type FinancialInvariantIssue = { code: string; message: string };

const amount = (value: unknown) => Math.max(0, Number(value) || 0);

export function validatePaymentInvariant(payment: {
  amount?: number;
  postedAmount?: number;
  allocation?: Record<string, unknown> | null;
  reversalTotal?: number;
}): FinancialInvariantIssue[] {
  const issues: FinancialInvariantIssue[] = [];
  const original = amount(payment.postedAmount ?? payment.amount);
  const allocation = payment.allocation || {};
  const allocated = ["rent", "utilities", "deposit", "other", "walletCredit"]
    .reduce((sum, key) => sum + amount(allocation[key]), 0);
  if (allocated > original + 0.01) issues.push({ code: "ALLOCATION_EXCEEDS_PAYMENT", message: "Allocation exceeds posted payment." });
  if (amount(payment.reversalTotal) > original + 0.01) issues.push({ code: "REVERSAL_EXCEEDS_PAYMENT", message: "Reversals exceed the posted payment." });
  return issues;
}

export function reconcileWalletTransactions(transactions: Array<{ direction?: string; amount?: number }>) {
  return Math.round(transactions.reduce((sum, transaction) => {
    const value = amount(transaction.amount);
    return sum + (transaction.direction === "DEBIT" ? -value : value);
  }, 0) * 100) / 100;
}


import type { PaymentAllocation, PaymentCategory } from "./tenant-payment-allocation";

export type FinancialAuditPayment = {
  id: string;
  amount: number;
  type?: PaymentCategory | string | null;
  allocation?: Partial<PaymentAllocation> | null;
};

export type FinancialAuditFinding = {
  paymentId: string;
  code: "ALLOCATION_SUM_MISMATCH" | "EXPLICIT_CATEGORY_MISMATCH" | "MISSING_CATEGORY";
  message: string;
};

const categories = ["deposit", "rent", "utilities", "other"] as const;

export function auditPaymentAllocations(payments: FinancialAuditPayment[]): FinancialAuditFinding[] {
  const findings: FinancialAuditFinding[] = [];
  for (const payment of payments) {
    const allocation = payment.allocation;
    if (!allocation) {
      if (payment.type == null) {
        findings.push({ paymentId: payment.id, code: "MISSING_CATEGORY", message: "Completed payment has no explicit category." });
      }
      continue;
    }

    const allocated = categories.reduce((sum, key) => sum + Math.max(0, Number(allocation[key]) || 0), 0);
    const walletCredit = Math.max(0, Number(allocation.walletCredit) || 0);
    const walletApplied = Math.max(0, Number(allocation.walletApplied) || 0);
    if (Math.round((allocated + walletCredit - walletApplied - Number(payment.amount)) * 100) / 100 !== 0) {
      findings.push({ paymentId: payment.id, code: "ALLOCATION_SUM_MISMATCH", message: "Allocated categories plus wallet credit do not equal payment amount." });
    }

    const typeToField: Record<string, typeof categories[number] | undefined> = {
      Rent: "rent",
      Utility: "utilities",
      Deposit: "deposit",
      Other: "other",
    };
    const expected = typeToField[String(payment.type)];
    if (expected && categories.some((key) => key !== expected && Math.max(0, Number(allocation[key]) || 0) > 0)) {
      findings.push({ paymentId: payment.id, code: "EXPLICIT_CATEGORY_MISMATCH", message: `${payment.type} payment has allocation in another category.` });
    }
  }
  return findings;
}

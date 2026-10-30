import { describe, expect, it } from "vitest";
import { summarizeTenantInvoices } from "./tenant-invoice-summary";

describe("tenant invoice report summary", () => {
  it("keeps billed, collected and outstanding figures separate and excludes cancelled invoices", () => {
    expect(summarizeTenantInvoices([
      { status: "paid", totalMinor: 10_000, amountPaidMinor: 10_000, balanceMinor: 0 },
      { status: "overdue", totalMinor: 8_000, amountPaidMinor: 3_000, balanceMinor: 5_000 },
      { status: "issued", totalMinor: 2_000, amountPaidMinor: 0, balanceMinor: 2_000 },
      { status: "draft", totalMinor: 4_000, amountPaidMinor: 0, balanceMinor: 4_000 },
      { status: "cancelled", totalMinor: 9_000, amountPaidMinor: 0, balanceMinor: 9_000 },
    ])).toEqual({
      totalInvoices: 3, draftInvoices: 1, totalInvoicedMinor: 20_000, totalCollectedMinor: 13_000,
      outstandingMinor: 7_000, paidInvoices: 1, partiallyPaidInvoices: 1, unpaidInvoices: 1,
      overdueInvoices: 1, settlementRate: 65,
    });
  });
});

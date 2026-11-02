import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: vi.fn(), invoiceStates: vi.fn() }));
vi.mock("@/lib/tenant-payment-allocation", () => ({ calculateTenantFinancialState: mocks.state }));
vi.mock("@/lib/tenant-invoices", () => ({
  addInvoicePaymentStates: mocks.invoiceStates,
  invoiceCategoryTotals: (invoice: any) => {
    const totals: Record<"rent" | "utilities" | "other", number> = { rent: 0, utilities: 0, other: 0 };
    for (const item of invoice.items || []) totals[(item.category === "utilities" || item.category === "other" ? item.category : "rent") as keyof typeof totals] += Math.round(Number(item.amount) || 0);
    for (const adjustment of invoice.adjustments || []) totals[(adjustment.category === "rent" || adjustment.category === "utilities" ? adjustment.category : "other") as keyof typeof totals] += Math.round(Number(adjustment.amountMinor) || 0);
    return { rent: Math.max(0, totals.rent), utilities: Math.max(0, totals.utilities), other: Math.max(0, totals.other) };
  },
}));

import { calculateTenantInvoiceDues } from "./tenant-invoice-dues";

function dbWith(invoices: any[] = [], charges: any[] = []) {
  return { collection: (name: string) => ({ find: (filter: any) => {
    const rows = name === "utilityCharges"
      ? charges
      : invoices.filter((invoice) => !filter?.status?.$in || filter.status.$in.includes(invoice.status));
    return { sort: () => ({ toArray: async () => rows }), toArray: async () => rows };
  } }) } as any;
}

describe("dues-based tenant invoice calculation", () => {
  beforeEach(() => {
    mocks.state.mockReset();
    mocks.invoiceStates.mockReset();
    mocks.invoiceStates.mockImplementation(async (_db, invoices) => invoices);
    mocks.state.mockResolvedValue({ rentPaid: 0, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 0, overdueUtilities: 0, penalties: 0, walletBalance: 0, monthsStayed: 1, rentObligations: [] });
  });

  it("returns no invoice lines for a tenant who is up to date", async () => {
    const result = await calculateTenantInvoiceDues(dbWith(), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-06-01"));
    expect(result.totalMinor).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("proposes only the remaining overdue amounts after ledger allocation", async () => {
    mocks.state.mockResolvedValue({ rentPaid: 8_000, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 7_000, overdueUtilities: 2_000, penalties: 0, walletBalance: 0, monthsStayed: 3, rentObligations: [{ billingPeriod: "2026-03", amount: 15_000, paid: 0, outstanding: 15_000, dueDate: new Date("2026-03-05"), overdue: true }] });
    const result = await calculateTenantInvoiceDues(dbWith(), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-06-01"));
    expect(result).toMatchObject({ rentMinor: 700_000, utilitiesMinor: 0, totalMinor: 700_000 });
    expect(result.lines.map((line) => line.category)).toEqual(["rent"]);
  });

  it("subtracts outstanding valid invoice coverage to prevent duplicate billing", async () => {
    mocks.state.mockResolvedValue({ rentPaid: 0, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 15_000, overdueUtilities: 0, penalties: 0, walletBalance: 0, monthsStayed: 3, rentObligations: [{ billingPeriod: "2026-03", amount: 15_000, paid: 0, outstanding: 15_000, dueDate: new Date("2026-03-05"), overdue: true }] });
    const active = [{ _id: "invoice-1", status: "issued", items: [{ category: "rent", amount: 500_000 }], balanceMinor: 500_000, paymentAllocations: [] }];
    const result = await calculateTenantInvoiceDues(dbWith(active), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-06-01"));
    expect(result.rentMinor).toBe(1_000_000);
    expect(result.existingInvoiceIds).toEqual(["invoice-1"]);
  });

  it("keeps month-by-month rent references, allocated payments, and contractual due dates", async () => {
    mocks.state.mockResolvedValue({ rentPaid: 23_000, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 0, overdueUtilities: 0, penalties: 0, walletBalance: 0, monthsStayed: 2, rentObligations: [
      { billingPeriod: "2026-03", amount: 15_000, dueDate: new Date("2026-03-05"), overdue: true },
      { billingPeriod: "2026-04", amount: 15_000, dueDate: new Date("2026-04-05"), overdue: true },
    ] });
    const result = await calculateTenantInvoiceDues(dbWith(), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-05-10"));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ obligationRef: "rent:2026-04", billingPeriod: "2026-04", originalAmountMinor: 1_500_000, amountPaidMinor: 800_000, amount: 700_000, dueDate: new Date("2026-04-05") });
  });

  it("includes only posted unpaid utility balances whose due date has passed", async () => {
    mocks.state.mockResolvedValue({ rentPaid: 0, utilitiesPaid: 50, depositPaid: 0, otherPaid: 0, overdueRent: 0, overdueUtilities: 1_000, penalties: 0, walletBalance: 100, monthsStayed: 1, rentObligations: [] });
    const charges = [
      { _id: "water-1", utilityName: "Water", billingPeriod: "2026-04", amount: 120, status: "posted", dueDate: new Date("2026-04-20") },
      { _id: "power-1", utilityName: "Power", billingPeriod: "2026-05", amount: 80, status: "posted", dueDate: new Date("2026-05-20") },
    ];
    const result = await calculateTenantInvoiceDues(dbWith([], charges), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-05-10"));
    expect(result.utilitiesMinor).toBe(7_000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ obligationRef: "utility:water-1", originalAmountMinor: 12_000, amountPaidMinor: 5_000, amount: 7_000 });
    expect(result.walletBalanceMinor).toBe(10_000);
    expect(result.overdueAmountMinor).toBe(7_000);
  });

  it("includes only overdue valid invoice rent balances and counts covered obligations once", async () => {
    mocks.state.mockResolvedValue({ rentPaid: 0, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 50, overdueUtilities: 0, penalties: 0, walletBalance: 0, monthsStayed: 1, rentObligations: [
      { billingPeriod: "2026-03", amount: 50, dueDate: new Date("2026-03-05"), overdue: true },
    ] });
    const invoices = [
      { _id: "open-overdue", status: "issued", dueDate: new Date("2026-03-10"), items: [{ category: "rent", amount: 5_000 }], obligationRefs: ["rent:2026-03"], paymentAllocations: [{ category: "rent", amountMinor: 2_000 }], balanceMinor: 3_000 },
      { _id: "future", status: "issued", dueDate: new Date("2026-06-10"), items: [{ category: "rent", amount: 9_000 }], paymentAllocations: [], balanceMinor: 9_000 },
      { _id: "void", status: "voided", dueDate: new Date("2026-03-01"), items: [{ category: "rent", amount: 8_000 }], paymentAllocations: [], balanceMinor: 8_000 },
      { _id: "superseded", status: "superseded", dueDate: new Date("2026-03-01"), items: [{ category: "rent", amount: 7_000 }], paymentAllocations: [], balanceMinor: 7_000 },
    ];
    const result = await calculateTenantInvoiceDues(dbWith(invoices), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-06-01"));
    expect(result.overdueRentMinor).toBe(3_000);
    expect(result.overdueAmountMinor).toBe(3_000);
    expect(result.existingInvoiceIds).toEqual(["future", "open-overdue"]);
  });

  it("does not count deposits, penalties, or unapplied wallet balance as overdue rent and utilities", async () => {
    mocks.state.mockResolvedValue({ rentPaid: 0, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 0, overdueUtilities: 0, penalties: 500, walletBalance: 800, monthsStayed: 1, rentObligations: [] });
    const result = await calculateTenantInvoiceDues(dbWith(), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-06-01"));
    expect(result.overdueAmountMinor).toBe(0);
    expect(result.walletBalanceMinor).toBe(80_000);
  });

  it("subtracts wallet credit only when the ledger records it as applied to overdue rent", async () => {
    const allocations = new Map([[
      "payment-1",
      { walletAllocation: { rent: 20 } },
    ]]);
    mocks.state.mockResolvedValue({ rentPaid: 0, utilitiesPaid: 0, depositPaid: 0, otherPaid: 0, overdueRent: 50, overdueUtilities: 0, penalties: 0, walletBalance: 80, monthsStayed: 1, rentObligations: [], paymentAllocations: allocations });
    const invoice = { _id: "wallet-applied", status: "issued", dueDate: new Date("2026-03-10"), items: [{ category: "rent", amount: 5_000 }], obligationRefs: ["rent:2026-03"], paymentAllocations: [], balanceMinor: 5_000 };
    const result = await calculateTenantInvoiceDues(dbWith([invoice]), { _id: "tenant-1" }, { _id: "property-1" }, new Date("2026-06-01"));
    expect(result.overdueAmountMinor).toBe(3_000);
    expect(result.walletBalanceMinor).toBe(8_000);
  });
});

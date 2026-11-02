import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: vi.fn(), invoiceStates: vi.fn() }));
vi.mock("@/lib/tenant-payment-allocation", () => ({ calculateTenantFinancialState: mocks.state }));
vi.mock("@/lib/tenant-invoices", () => ({ addInvoicePaymentStates: mocks.invoiceStates }));

import { calculateTenantInvoiceDues } from "./tenant-invoice-dues";

function dbWith(invoices: any[] = [], charges: any[] = []) {
  return { collection: (name: string) => ({ find: () => ({ sort: () => ({ toArray: async () => name === "utilityCharges" ? charges : invoices }), toArray: async () => name === "utilityCharges" ? charges : invoices }) }) } as any;
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
    const active = [{ _id: "invoice-1", items: [{ category: "rent", amount: 500_000 }], balanceMinor: 500_000, paymentAllocations: [] }];
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
  });
});

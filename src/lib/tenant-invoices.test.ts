import { describe, expect, it } from "vitest";
import { addInvoicePaymentStates, invoiceCategoryTotals, invoiceItemsForDisplay, invoiceTotals } from "./tenant-invoices";

const invoice = (overrides: Record<string, unknown> = {}) => ({
  _id: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", status: "issued", totalMinor: 10_000,
  billingPeriod: "2026-01", dueDate: new Date("2026-01-05T00:00:00Z"),
  items: [{ category: "rent", amount: 10_000 }], ...overrides,
});

function fakeDb(rows: any[], invoices: any[] = []) {
  return { collection: (name: string) => ({ find: () => ({ toArray: async () => name === "financialLedger" ? rows : invoices }) }) } as any;
}

describe("tenant invoice calculations", () => {
  it("calculates item totals in integer minor units", () => {
    expect(invoiceTotals([{ quantity: 2, unitAmount: 1234 }, { quantity: 1.5, unitAmount: 200 }])).toEqual({
      items: [{ quantity: 2, unitAmount: 1234, amount: 2468 }, { quantity: 1.5, unitAmount: 200, amount: 300 }],
      totalMinor: 2768,
    });
  });

  it("keeps audited credits and charges as separate signed adjustments", () => {
    const adjusted = invoice({ adjustments: [
      { description: "Rent credit", category: "rent", amountMinor: -1_000 },
      { description: "Water correction", category: "utilities", amountMinor: 250 },
    ] });
    expect(invoiceCategoryTotals(adjusted)).toEqual({ rent: 9_000, utilities: 250, other: 0 });
    expect(invoiceItemsForDisplay(adjusted).slice(-2).map((item) => item.amount)).toEqual([-1_000, 250]);
  });

  it("reflects verified partial payment and reversals without counting deposits as rent", async () => {
    const rows = [
      { kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", providerReference: "M-PESA-1", occurredAt: "2026-01-01T00:00:00.000Z", allocation: { rent: 50, deposit: 25 } },
      { kind: "PAYMENT_REVERSED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 10, deposit: 5 } },
    ];
    const [result] = await addInvoicePaymentStates(fakeDb(rows), [invoice({ dueDate: new Date(Date.now() + 86_400_000) })]);
    expect(result.status).toBe("partially_paid");
    expect(result.amountPaidMinor).toBe(4000);
    expect(result.balanceMinor).toBe(6000);
    expect(result.paymentAllocations).toEqual([{
      paymentId: "payment-1", reference: "M-PESA-1", category: "rent", amountMinor: 4000, occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    }]);
  });

  it("marks a fully allocated invoice paid and excludes cancelled invoices", async () => {
    const rows = [{ kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 100 } }];
    const result = await addInvoicePaymentStates(fakeDb(rows), [invoice(), invoice({ _id: "invoice-2", status: "cancelled" })]);
    expect(result[0].status).toBe("paid");
    expect(result[0].balanceMinor).toBe(0);
    expect(result[1].status).toBe("cancelled");
  });

  it("traces a payment to the oldest invoice first", async () => {
    const rows = [{ kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 150 } }];
    const result = await addInvoicePaymentStates(fakeDb(rows), [
      invoice({ billingPeriod: "2026-01", totalMinor: 10_000 }),
      invoice({ _id: "invoice-2", billingPeriod: "2026-02", totalMinor: 10_000 }),
    ]);

    expect(result.map((item) => item.amountPaidMinor)).toEqual([10_000, 5_000]);
    expect(result[0].paymentAllocations[0]).toMatchObject({ paymentId: "payment-1", amountMinor: 10_000 });
    expect(result[1].paymentAllocations[0]).toMatchObject({ paymentId: "payment-1", amountMinor: 5_000 });
  });

  it("allocates against earlier invoices even when details are requested for one invoice", async () => {
    const previous = invoice({ billingPeriod: "2026-01", totalMinor: 10_000 });
    const current = invoice({ _id: "invoice-2", billingPeriod: "2026-02", totalMinor: 10_000 });
    const rows = [{ kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 150 } }];
    const [result] = await addInvoicePaymentStates(fakeDb(rows, [previous, current]), [current]);

    expect(result.amountPaidMinor).toBe(5_000);
    expect(result.balanceMinor).toBe(5_000);
  });

  it("marks an unpaid past-due invoice overdue", async () => {
    const [result] = await addInvoicePaymentStates(fakeDb([]), [invoice()]);
    expect(result.status).toBe("overdue");
    expect(result.balanceDue).toBe(100);
  });

  it("keeps a partially paid past-due invoice in the overdue balance", async () => {
    const rows = [{ kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 50 } }];
    const [result] = await addInvoicePaymentStates(fakeDb(rows), [invoice()]);

    expect(result.status).toBe("overdue");
    expect(result.amountPaidMinor).toBe(5_000);
    expect(result.balanceMinor).toBe(5_000);
  });
});

import { describe, expect, it } from "vitest";
import { addInvoicePaymentStates, invoiceCategoryTotals, invoiceItemsForDisplay, invoiceTotals, recordTenantInvoicePaymentReversal, recordTenantInvoiceWalletAllocations } from "./tenant-invoices";

const invoice = (overrides: Record<string, unknown> = {}) => ({
  _id: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", status: "issued", totalMinor: 10_000,
  billingPeriod: "2026-01", dueDate: new Date("2026-01-05T00:00:00Z"),
  items: [{ category: "rent", amount: 10_000 }], ...overrides,
});

function fakeDb(rows: any[] = [], invoices: any[] = [], invoiceEvents: any[] = [], walletRows: any[] = [], payments: any[] = []) {
  return { collection: (name: string) => ({
    find: () => {
      const source = name === "financialLedger" ? rows
        : name === "tenantInvoices" ? invoices
          : name === "tenantInvoiceLedger" ? invoiceEvents
            : name === "walletTransactions" ? walletRows
              : name === "payments" ? payments : [];
      return { project() { return this; }, sort() { return this; }, limit() { return this; }, toArray: async () => source };
    },
  }) } as any;
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
    expect(invoiceCategoryTotals(adjusted)).toEqual({ rent: 9_000, utilities: 250, deposit: 0, penalty: 0, other: 0 });
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
      paymentId: "payment-1", reference: "M-PESA-1", category: "rent", amountMinor: 4000, occurredAt: new Date("2026-01-01T00:00:00.000Z"), source: "payment",
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

  it("prioritizes the invoice selected by the tenant for a posted payment", async () => {
    const rows = [{ kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 50 } }];
    const invoices = [invoice({ billingPeriod: "2026-01" }), invoice({ _id: "invoice-2", billingPeriod: "2026-02" })];
    const payments = [{ _id: "payment-1", tenantInvoiceId: "invoice-2" }];
    const result = await addInvoicePaymentStates(fakeDb(rows, invoices, [], [], payments), invoices);

    expect(result.map((item) => item.amountPaidMinor)).toEqual([0, 5_000]);
    expect(result[1].paymentAllocations[0]).toMatchObject({ paymentId: "payment-1", amountMinor: 5_000 });
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

  it("calculates rent, utilities, penalty, deposit, and other charges from invoice items", async () => {
    const mixed = invoice({ items: [
      { description: "Rent", quantity: 1, unitAmount: 8000, amount: 8000, category: "rent" },
      { description: "Water", quantity: 1, unitAmount: 500, amount: 500, category: "utilities" },
      { description: "Late fee", quantity: 1, unitAmount: 200, amount: 200, category: "penalty" },
      { description: "Deposit", quantity: 1, unitAmount: 1000, amount: 1000, category: "deposit" },
      { description: "Repair", quantity: 1, unitAmount: 300, amount: 300, category: "other" },
    ] });
    const [result] = await addInvoicePaymentStates(fakeDb(), [mixed]);
    expect(result.categoryTotalsMinor).toEqual({ rent: 8000, utilities: 500, deposit: 1000, penalty: 200, other: 300 });
    expect(result.totalMinor).toBe(10_000);
  });

  it("uses immutable charge snapshots and signed adjustment events for invoice totals", async () => {
    const events = [
      { invoiceId: "invoice-1", kind: "CHARGE_SNAPSHOT", items: [{ description: "Rent", quantity: 1, unitAmount: 10000, amount: 10000, category: "rent" }] },
      { invoiceId: "invoice-1", kind: "CHARGE_ADJUSTMENT", category: "rent", description: "Approved credit", amountMinor: -2000 },
    ];
    const [result] = await addInvoicePaymentStates(fakeDb([], [], events), [invoice()]);
    expect(result.originalInvoiceTotalMinor).toBe(10_000);
    expect(result.totalMinor).toBe(8_000);
    expect(result.balanceMinor).toBe(8_000);
    expect(result.displayItems.at(-1)).toMatchObject({ amount: -2000, category: "rent" });
  });

  it("uses specific-invoice allocation events without double-counting their posted ledger payment", async () => {
    const rows = [{ kind: "PAYMENT_POSTED", status: "posted", sourcePaymentId: "payment-1", allocation: { rent: 50 } }];
    const events = [{ invoiceId: "invoice-1", kind: "PAYMENT_ALLOCATION", category: "rent", amountMinor: 5000, sourcePaymentId: "payment-1", eventKey: "payment:1", occurredAt: "2026-01-02T00:00:00Z" }];
    const [result] = await addInvoicePaymentStates(fakeDb(rows, [], events), [invoice({ dueDate: new Date("2026-12-01T00:00:00Z") })]);
    expect(result.amountPaidMinor).toBe(5000);
    expect(result.balanceMinor).toBe(5000);
    expect(result.paymentAllocations).toHaveLength(1);
  });

  it("applies wallet credits to invoice balances and exposes their amount separately", async () => {
    const events = [{ invoiceId: "invoice-1", kind: "WALLET_APPLIED", category: "rent", amountMinor: 2500, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-1", eventKey: "wallet:1", occurredAt: "2026-01-02T00:00:00Z" }];
    const [result] = await addInvoicePaymentStates(fakeDb([], [], events), [invoice({ dueDate: new Date("2026-12-01T00:00:00Z") })]);
    expect(result.amountPaidMinor).toBe(2500);
    expect(result.walletCreditAppliedMinor).toBe(2500);
    expect(result.balanceMinor).toBe(7500);
  });

  it("reverses a prior invoice allocation without rewriting the payment event", async () => {
    const events = [
      { invoiceId: "invoice-1", kind: "PAYMENT_ALLOCATION", category: "rent", amountMinor: 5000, sourcePaymentId: "payment-1", eventKey: "payment:1", occurredAt: "2026-01-02T00:00:00Z" },
      { invoiceId: "invoice-1", kind: "PAYMENT_ALLOCATION_REVERSED", category: "rent", amountMinor: 2000, sourcePaymentId: "payment-1", sourceReversalKey: "reversal:1", eventKey: "reversal:1:invoice", occurredAt: "2026-01-03T00:00:00Z" },
    ];
    const [result] = await addInvoicePaymentStates(fakeDb([], [], events), [invoice({ dueDate: new Date("2026-12-01T00:00:00Z") })]);
    expect(result.amountPaidMinor).toBe(3000);
    expect(result.reversedAmountMinor).toBe(2000);
    expect(result.balanceMinor).toBe(7000);
    expect(result.paymentAllocations.filter((row: any) => row.reversal)).toHaveLength(1);
  });

  it("reverses only the wallet credit applied to the invoice", async () => {
    const events = [
      { invoiceId: "invoice-1", kind: "WALLET_APPLIED", category: "rent", amountMinor: 5000, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-1", eventKey: "wallet:1" },
      { invoiceId: "invoice-1", kind: "WALLET_ALLOCATION_REVERSED", category: "rent", amountMinor: 2000, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-1", sourceReversalKey: "reversal:1", eventKey: "reversal:1:wallet" },
    ];
    const [result] = await addInvoicePaymentStates(fakeDb([], [], events), [invoice({ dueDate: new Date("2026-12-01T00:00:00Z") })]);
    expect(result).toMatchObject({ amountPaidMinor: 3000, walletCreditAppliedMinor: 3000, reversedAmountMinor: 2000, balanceMinor: 7000 });
  });

  it("reopens a stored paid invoice when its allocation is reversed", async () => {
    const events = [
      { invoiceId: "invoice-1", kind: "PAYMENT_ALLOCATION", category: "rent", amountMinor: 10_000, sourcePaymentId: "payment-1", eventKey: "payment:1" },
      { invoiceId: "invoice-1", kind: "PAYMENT_ALLOCATION_REVERSED", category: "rent", amountMinor: 2_500, sourcePaymentId: "payment-1", eventKey: "reversal:1", sourceReversalKey: "reversal:1" },
    ];
    const [result] = await addInvoicePaymentStates(fakeDb([], [], events), [invoice({ status: "paid", dueDate: new Date("2026-01-05T00:00:00Z") })]);
    expect(result).toMatchObject({ status: "overdue", amountPaidMinor: 7_500, balanceMinor: 2_500 });
  });

  it("reconstructs legacy wallet reversal amounts from wallet consumption records", async () => {
    const invoiceEvents: any[] = [{
      eventKey: "wallet:invoice-1:rent", invoiceId: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", landlordId: "owner-1",
      kind: "WALLET_APPLIED", category: "rent", amountMinor: 5_000, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-1", occurredAt: new Date("2026-01-02"),
    }];
    const walletRows = [{
      eventKey: "wallet-1", kind: "CREDIT_CONSUMED", amount: 50, sourcePaymentId: "payment-1", tenantId: "tenant-1", propertyId: "property-1",
      walletAllocation: { rent: 50, utilities: 0, deposit: 0, other: 0 }, createdAt: new Date("2026-01-02"),
    }];
    const db = { collection: (name: string) => name === "tenantInvoiceLedger" ? {
      createIndexes: async () => [],
      find: (query: any) => {
        const selected = invoiceEvents.filter((row) => (!query.sourcePaymentId || row.sourcePaymentId === query.sourcePaymentId) &&
          (!query.sourceReversalKey || row.sourceReversalKey === query.sourceReversalKey) &&
          (!query.invoiceId || row.invoiceId === query.invoiceId) && (!query.category || row.category === query.category) &&
          (!query.kind?.$in || query.kind.$in.includes(row.kind)) && (typeof query.kind !== "string" || row.kind === query.kind));
        return { sort() { return this; }, toArray: async () => selected };
      },
      updateOne: async (query: any, update: any) => {
        if (invoiceEvents.some((row) => row.eventKey === query.eventKey)) return { upsertedCount: 0 };
        invoiceEvents.push(update.$setOnInsert);
        return { upsertedCount: 1 };
      },
    } : {
      find: () => ({ sort() { return this; }, toArray: async () => walletRows }),
    } } as any;
    const reversed = await recordTenantInvoicePaymentReversal(db, {
      _id: "payment-1", tenantId: "tenant-1", propertyId: "property-1", landlordId: "owner-1", amount: 100,
      allocation: { rent: 0, utilities: 0, deposit: 0, other: 0, walletCredit: 100, walletApplied: 0, walletAllocation: { rent: 0 } },
    }, {
      eventKey: "reversal:legacy-wallet", amount: 50, postedAt: new Date("2026-01-03"),
      allocation: { rent: 0, utilities: 0, deposit: 0, other: 0, walletAllocation: { rent: 0, utilities: 0, deposit: 0, other: 0 } },
    });

    expect(reversed).toBe(2_500);
    expect(invoiceEvents.at(-1)).toMatchObject({ kind: "WALLET_ALLOCATION_REVERSED", amountMinor: 2_500, sourceReversalKey: "reversal:legacy-wallet" });
  });

  it("keeps wallet allocation corrections linked to the original wallet event", async () => {
    const invoice = {
      _id: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", landlordId: "owner-1", status: "issued",
      totalMinor: 10_000, items: [{ description: "Rent", amount: 10_000, category: "rent" }],
    };
    const events: any[] = [
      { eventKey: "wallet-a:invoice:invoice-1:rent", invoiceId: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", landlordId: "owner-1", kind: "WALLET_APPLIED", category: "rent", amountMinor: 1_000, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-a", occurredAt: new Date("2026-01-01") },
      { eventKey: "wallet-b:invoice:invoice-1:rent", invoiceId: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", landlordId: "owner-1", kind: "WALLET_APPLIED", category: "rent", amountMinor: 1_000, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-b", occurredAt: new Date("2026-01-02") },
      { eventKey: "reversal:wallet-b", invoiceId: "invoice-1", tenantId: "tenant-1", propertyId: "property-1", landlordId: "owner-1", kind: "WALLET_ALLOCATION_REVERSED", category: "rent", amountMinor: 1_000, sourcePaymentId: "payment-1", sourceWalletEventKey: "wallet-b", occurredAt: new Date("2026-01-03") },
    ];
    const payment = { _id: "payment-1", tenantId: "tenant-1", propertyId: "property-1", allocation: {} };
    const cursor = (rows: any[]) => ({ sort() { return this; }, limit() { return this; }, project() { return this; }, toArray: async () => rows });
    const db = { collection: (name: string) => {
      if (name === "tenantInvoices") return { find: () => cursor([invoice]) };
      if (name === "payments") return { find: () => cursor([payment]) };
      if (name === "walletTransactions") return { find: () => cursor([]) };
      if (name === "financialLedger") return { find: () => cursor([]) };
      if (name === "tenantInvoiceLedger") return {
        createIndexes: async () => [],
        find: (query: any) => cursor(events.filter((event) => (!query.sourcePaymentId || event.sourcePaymentId === query.sourcePaymentId) &&
          (!query.tenantId || event.tenantId === query.tenantId) && (!query.propertyId || event.propertyId === query.propertyId) &&
          (!query.kind?.$in || query.kind.$in.includes(event.kind)) && (typeof query.kind !== "string" || query.kind === event.kind))),
        updateOne: async (query: any, update: any) => {
          if (events.some((event) => event.eventKey === query.eventKey)) return { upsertedCount: 0 };
          events.push(update.$setOnInsert);
          return { upsertedCount: 1 };
        },
      };
      throw new Error(`Unexpected collection: ${name}`);
    } } as any;

    await recordTenantInvoiceWalletAllocations(db, "tenant-1", new Map([["payment-1", { walletAllocation: { rent: 5, utilities: 0, deposit: 0, other: 0 } }]]), "wallet-sync:1");

    expect(events.at(-1)).toMatchObject({ kind: "WALLET_ALLOCATION_REVERSED", amountMinor: 500, sourceWalletEventKey: "wallet-a" });
  });

  it("keeps paid invoices at zero balance and retains cancelled invoice status", async () => {
    const events = [{ invoiceId: "invoice-1", kind: "PAYMENT_ALLOCATION", category: "rent", amountMinor: 10000, sourcePaymentId: "payment-1", eventKey: "payment:1" }];
    const result = await addInvoicePaymentStates(fakeDb([], [], events), [invoice(), invoice({ _id: "cancelled", status: "cancelled" })]);
    expect(result[0]).toMatchObject({ status: "paid", balanceMinor: 0 });
    expect(result[1].status).toBe("cancelled");
  });
});

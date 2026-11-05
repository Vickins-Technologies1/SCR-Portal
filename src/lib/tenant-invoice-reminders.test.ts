import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  calculate: vi.fn(),
  generatePdf: vi.fn(),
  sendEmail: vi.fn(),
  resolveRouting: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mongodb", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/lib/tenant-invoices", () => ({ addInvoicePaymentStates: mocks.calculate }));
vi.mock("@/lib/tenant-invoice-pdf", () => ({ generateTenantInvoicePdf: mocks.generatePdf }));
vi.mock("@/lib/email", () => ({ sendInvoiceEmail: mocks.sendEmail }));
vi.mock("@/lib/mpesa-routing", () => ({ resolveOwnerTenantMpesaRouting: mocks.resolveRouting }));

import { sendTenantInvoiceReminders } from "./tenant-invoice-reminders";

describe("tenant invoice reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the reopened balance reminder when a reversed payment left stored status paid", async () => {
    const invoiceId = "64b000000000000000000001";
    const tenantId = "64b000000000000000000002";
    const propertyId = "64b000000000000000000003";
    const landlordId = "64b000000000000000000004";
    const storedInvoice = {
      _id: invoiceId, tenantId, propertyId, landlordId, status: "paid", invoiceNumber: "TI-001",
      dueDate: new Date("2026-01-05T00:00:00Z"), issueDate: new Date("2026-01-01T00:00:00Z"), billingPeriod: "2026-01",
      items: [{ description: "Rent", amount: 10_000, category: "rent" }],
    };
    const reopenedInvoice = {
      ...storedInvoice, status: "overdue", totalMinor: 10_000, originalInvoiceTotalMinor: 10_000,
      amountPaidMinor: 5_000, balanceMinor: 5_000, walletCreditAppliedMinor: 0, reversedAmountMinor: 5_000,
      displayItems: storedInvoice.items, paymentAllocations: [],
    };
    const reminderLogs = new Map<string, any>();
    const collection = (name: string) => {
      if (name === "tenantInvoices") return {
        find: () => ({ toArray: async () => [storedInvoice] }),
        findOne: async () => storedInvoice,
      };
      if (name === "landlordBillingSettings") return {
        find: () => ({ toArray: async () => [{ landlordId, invoicingEnabled: true, remindersEnabled: true, overdueReminderEveryDays: 5 }] }),
        findOne: async () => ({ landlordId, invoicingEnabled: true, remindersEnabled: true }),
      };
      if (name === "tenantInvoiceReminderLogs") return {
        createIndex: async () => "tenantInvoiceReminderLogs_key_unique",
        updateOne: async (query: any, update: any) => {
          const key = String(query.reminderKey);
          const existing = reminderLogs.get(key);
          if (!existing && update.$setOnInsert) {
            reminderLogs.set(key, update.$setOnInsert);
            return { upsertedCount: 1, modifiedCount: 0 };
          }
          reminderLogs.set(key, { ...existing, ...update.$set });
          return { upsertedCount: 0, modifiedCount: 1 };
        },
        findOne: async (query: any) => reminderLogs.get(String(query.reminderKey)) || null,
      };
      if (name === "tenantInvoiceDeliveries") return { findOne: async () => null };
      if (name === "tenantInvoiceActivity") return { insertOne: async () => ({ acknowledged: true }) };
      if (name === "tenants") return { findOne: async () => ({ name: "Tenant One", email: "tenant@example.test" }) };
      if (name === "properties") return { findOne: async () => ({ name: "Sample Property", address: "Nairobi" }) };
      if (name === "propertyOwners") return { findOne: async () => ({ name: "Owner One", email: "owner@example.test" }) };
      throw new Error(`Unexpected collection: ${name}`);
    };
    const db = { collection };
    mocks.connect.mockResolvedValue({ db });
    mocks.calculate.mockImplementation(async (_db: unknown, rows: any[]) => rows.map(() => reopenedInvoice));
    mocks.generatePdf.mockResolvedValue({ pdfBytes: Buffer.from("pdf") });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.resolveRouting.mockResolvedValue({ paymentType: "paybill", shortcode: "123456" });

    const result = await sendTenantInvoiceReminders(new Date("2026-01-10T09:00:00Z"));

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(mocks.calculate).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ amount: 50, invoiceNumber: "TI-001" }));
    expect([...reminderLogs.values()][0]).toMatchObject({ status: "sent", amountMinor: 5_000 });
  });
});

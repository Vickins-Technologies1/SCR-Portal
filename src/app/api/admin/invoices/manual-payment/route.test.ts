import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

const state = vi.hoisted(() => ({
  auth: { userId: "64a000000000000000000011", role: "admin" as const, permissions: [] },
  invoice: null as any,
  owner: null as any,
  payments: [] as any[],
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn(async () => state.auth) }));
vi.mock("@/lib/csrf", () => ({
  validateCsrfToken: vi.fn(() => true),
  buildInvalidCsrfResponse: vi.fn(() => new Response("csrf", { status: 403 })),
}));
vi.mock("@/lib/financial-reporting", () => ({
  calculateInvoiceFinancialState: vi.fn(async (_db: unknown, invoice: any) => ({
    total: invoice.amount,
    amountPaid: invoice.amountPaid || 0,
    balanceDue: invoice.balanceDue ?? invoice.amount - (invoice.amountPaid || 0),
    status: invoice.amountPaid ? "PARTIALLY PAID" : "DUE",
  })),
}));
vi.mock("@/lib/verified-payment-posting", () => ({
  postVerifiedPayment: vi.fn(async ({ paymentId }: any) => {
    const payment = state.payments.find((item) => item._id?.equals(paymentId));
    payment.financialPostingStatus = "posted";
    payment.financialEffectsApplied = true;
    return { outcome: "posted", payment };
  }),
}));
vi.mock("@/lib/mongodb", () => ({
  connectToDatabase: vi.fn(async () => ({ db: {
    collection(name: string) {
      if (name === "invoices") return { findOne: async () => state.invoice };
      if (name === "propertyOwners") return { findOne: async () => state.owner };
      if (name === "payments") return {
        findOne: async (query: any) => {
          if (query.paymentId) return state.payments.find((item) => item.paymentId === query.paymentId) || null;
          if (query.$or) return state.payments.find((item) => query.$or.some((clause: any) => Object.entries(clause).some(([key, value]) => item[key] === value))) || null;
          return null;
        },
        insertOne: async (item: any) => { state.payments.push(item); return { acknowledged: true }; },
        updateOne: async (query: any, update: any) => {
          const payment = state.payments.find((item) => item.paymentId === query.paymentId);
          if (payment) Object.assign(payment, update.$set);
          return { matchedCount: payment ? 1 : 0 };
        },
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  } }))
}));

const invoiceId = "64a000000000000000000022";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/invoices/manual-payment", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": "valid" },
    body: JSON.stringify(body),
  });
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  invoiceId,
  idempotencyKey: "64a00000-0000-4000-8000-000000000001",
  amount: 1200,
  method: "mpesa_paybill",
  reference: "QWE123ABC",
  paymentDate: new Date(Date.now() - 60_000).toISOString(),
  note: "Verified against bank receipt",
  ...overrides,
});

describe("admin manual invoice payment", () => {
  beforeEach(() => {
    state.auth = { userId: "64a000000000000000000011", role: "admin", permissions: [] };
    state.invoice = { _id: new ObjectId(invoiceId), userId: "64a000000000000000000033", propertyId: "property-1", amount: 1200, reference: "INV-2026-04", dueDate: new Date() };
    state.owner = { _id: new ObjectId("64a000000000000000000033"), name: "Owner Example" };
    state.payments = [];
  });

  it("records an authorized full payment as an auditable posted payment", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(validBody()));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(state.payments[0]).toMatchObject({
      amount: 1200,
      provider: "admin_manual",
      paymentMethod: "mpesa_paybill",
      reference: "QWE123ABC",
      adminPaymentRecordedBy: state.auth.userId,
      invoiceStatusBefore: "DUE",
      invoiceBalanceBefore: 1200,
    });
    expect(state.payments[0]._id).toBeInstanceOf(ObjectId);
  });

  it("rejects non-admin access", async () => {
    state.auth = NextResponse.json({ success: false }, { status: 403 }) as any;
    const { POST } = await import("./route");
    const response = await POST(request(validBody()));
    expect(response.status).toBe(403);
    expect(state.payments).toHaveLength(0);
  });

  it("rejects overpayments and missing required references", async () => {
    const { POST } = await import("./route");
    const overpayment = await POST(request(validBody({ amount: 1200.01 })));
    expect(overpayment.status).toBe(400);
    const missingReference = await POST(request(validBody({ reference: "" })));
    expect(missingReference.status).toBe(400);
    expect(state.payments).toHaveLength(0);
  });

  it("allows a partial cash payment without a reference", async () => {
    state.invoice.balanceDue = 1200;
    const { POST } = await import("./route");
    const response = await POST(request(validBody({ amount: 500, method: "cash", reference: "" })));
    expect(response.status).toBe(200);
    expect(state.payments[0]).toMatchObject({ amount: 500, paymentMethod: "cash", reference: null });
  });
});

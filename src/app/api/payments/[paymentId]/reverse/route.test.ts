import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { connectToDatabase, createPaymentReversal, validateCsrfToken } = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  createPaymentReversal: vi.fn(),
  validateCsrfToken: vi.fn(() => true),
}));

vi.mock("@/lib/mongodb", () => ({ connectToDatabase }));
vi.mock("@/lib/financial-ledger", () => ({ createPaymentReversal }));
vi.mock("@/lib/csrf", () => ({ validateCsrfToken, buildInvalidCsrfResponse: () => new Response("csrf", { status: 403 }) }));

const ownerId = "64a000000000000000000001";
const paymentId = "64a000000000000000000002";
const propertyId = "64a000000000000000000003";
const tenantId = "64a000000000000000000004";

function request(role = "propertyOwner", userId = ownerId, body: Record<string, unknown> = { reason: "Incorrect amount" }) {
  const cookies: Record<string, string> = { userId, role, "csrf-token": "csrf" };
  return {
    headers: new Headers({ "x-csrf-token": "csrf" }),
    cookies: { get: (name: string) => cookies[name] ? { value: cookies[name] } : undefined },
    json: async () => body,
  } as unknown as NextRequest;
}

function mockDatabase(payment: Record<string, unknown>, propertyOwnerId = ownerId, priorReversal: Record<string, unknown> | null = null) {
  connectToDatabase.mockResolvedValue({
    db: {
      collection: (name: string) => {
        if (name === "payments") return { findOne: async () => payment };
        if (name === "properties") return { findOne: async () => ({ _id: propertyId, ownerId: propertyOwnerId }) };
        if (name === "tenants") return { findOne: async () => ({ _id: tenantId, propertyId }) };
        if (name === "financialLedger") return { findOne: async (query: Record<string, unknown>) => query.eventKey ? priorReversal : null };
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
  });
}

function manualPayment() {
  return {
    _id: paymentId,
    tenantId,
    propertyId,
    transactionId: "MANUAL-abc123",
    providerTransactionId: "MANUAL-abc123",
    postedAmount: 1250,
    amount: 1250,
    status: "completed",
    financialPostingStatus: "posted",
    allocation: { rent: 1000, utilities: 250 },
  };
}

describe("POST /api/payments/[paymentId]/reverse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfToken.mockReturnValue(true);
    createPaymentReversal.mockResolvedValue({ eventKey: "reversal:test", status: "posted" });
  });

  it("reverses the server-recorded full manual amount for its property owner", async () => {
    mockDatabase(manualPayment());
    const { POST } = await import("@/app/api/payments/[paymentId]/reverse/route");
    const response = await POST(request() as any, { params: Promise.resolve({ paymentId }) });

    expect(response.status).toBe(200);
    expect(createPaymentReversal).toHaveBeenCalledWith(expect.objectContaining({
      paymentId,
      amount: 1250,
      reason: "Incorrect amount",
      actorId: ownerId,
      idempotencyKey: `manual-payment:${paymentId}`,
    }));
  }, 15000);

  it("rejects a payment belonging to another owner", async () => {
    mockDatabase(manualPayment(), "64a000000000000000000099");
    const { POST } = await import("@/app/api/payments/[paymentId]/reverse/route");
    const response = await POST(request() as any, { params: Promise.resolve({ paymentId }) });

    expect(response.status).toBe(403);
    expect(createPaymentReversal).not.toHaveBeenCalled();
  });

  it("returns the existing reversal on a repeated request without posting another event", async () => {
    const reversal = { eventKey: `reversal:manual-payment:${paymentId}`, status: "posted" };
    mockDatabase({ ...manualPayment(), status: "reversed" }, ownerId, reversal);
    const { POST } = await import("@/app/api/payments/[paymentId]/reverse/route");
    const response = await POST(request() as any, { params: Promise.resolve({ paymentId }) });

    expect(response.status).toBe(200);
    expect(createPaymentReversal).toHaveBeenCalledWith(expect.objectContaining({
      paymentId,
      amount: 1250,
      idempotencyKey: `manual-payment:${paymentId}`,
    }));
  });

  it("rejects provider-confirmed payments even if their request claims they are manual", async () => {
    mockDatabase({ ...manualPayment(), transactionId: "MPESA-1", provider: "daraja" });
    const { POST } = await import("@/app/api/payments/[paymentId]/reverse/route");
    const response = await POST(request("propertyOwner", ownerId, { reason: "Other", note: "please reverse", origin: "manual" }) as any, { params: Promise.resolve({ paymentId }) });

    expect(response.status).toBe(409);
    expect(createPaymentReversal).not.toHaveBeenCalled();
  });

  it("rejects tenant sessions", async () => {
    const { POST } = await import("@/app/api/payments/[paymentId]/reverse/route");
    const response = await POST(request("tenant", tenantId) as any, { params: Promise.resolve({ paymentId }) });

    expect(response.status).toBe(401);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("requires a note for Other", async () => {
    mockDatabase(manualPayment());
    const { POST } = await import("@/app/api/payments/[paymentId]/reverse/route");
    const response = await POST(request("propertyOwner", ownerId, { reason: "Other", note: " " }) as any, { params: Promise.resolve({ paymentId }) });

    expect(response.status).toBe(400);
    expect(createPaymentReversal).not.toHaveBeenCalled();
  });
});

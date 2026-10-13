import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { initiateStkPush } = vi.hoisted(() => ({ initiateStkPush: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/lib/mpesa", () => ({
  getMpesaCallbackUrl: vi.fn(() => "https://example.test/api/owner/invoice-payments/daraja-callback"),
  initiateStkPush,
  isStkPushAccepted: vi.fn(() => true),
  isValidKenyanMsisdn: vi.fn(() => true),
  normalizePhoneNumber: vi.fn((phone: string) => phone),
  resolveDarajaPlatformStkCredentials: vi.fn(() => ({ shortcode: "100200", passkey: "secret", consumerKey: "key", consumerSecret: "secret" })),
}));
vi.mock("@/lib/mpesa-routing", () => ({ resolveOwnerTenantMpesaRouting: vi.fn() }));

import { connectToDatabase } from "@/lib/mongodb";

const ownerId = "64a000000000000000000001";
const invoiceId = "64a000000000000000000002";

function request(body: Record<string, unknown>) {
  const cookies: Record<string, string> = { userId: ownerId, role: "propertyOwner", "csrf-token": "csrf" };
  return {
    headers: new Headers({ "x-csrf-token": "csrf", "x-forwarded-for": `${Date.now()}-${Math.random()}` }),
    cookies: {
      get: (name: string) => cookies[name] ? { value: cookies[name] } : undefined,
    },
    json: async () => body,
  } as unknown as NextRequest;
}

describe("owner invoice payment provider resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the current persisted platform provider despite a stale invoice snapshot and forged request fields", async () => {
    const insertedPayments: Record<string, unknown>[] = [];
    vi.mocked(connectToDatabase).mockResolvedValue({
      db: {
        collection: (name: string) => {
          if (name === "invoices") return { findOne: async () => ({ _id: invoiceId, userId: ownerId, propertyId: "property-1", amount: 1200, status: "pending", reference: "INV-1", paymentProvider: "kopokopo" }) };
          if (name === "propertyOwners") return { findOne: async () => ({ phone: "254700000001" }) };
          if (name === "platformSettings") return { findOne: async () => ({ provider: "daraja" }) };
          if (name === "payments") return {
            findOne: async () => null,
            insertOne: async (payment: Record<string, unknown>) => { insertedPayments.push(payment); },
          };
          throw new Error(`Unexpected collection: ${name}`);
        },
      } as any,
      client: {} as any,
    });
    initiateStkPush.mockResolvedValue({ ResponseCode: "0", CheckoutRequestID: "checkout-1", MerchantRequestID: "merchant-1", CustomerMessage: "Prompt sent" });

    const { POST } = await import("@/app/api/mpesa/stk-push/route");
    const response = await POST(request({
      amount: 1200,
      phone: "254700000001",
      invoiceId,
      landlordId: ownerId,
      type: "Other",
      provider: "kopokopo",
      paymentRail: "user_paybill",
      destination: "attacker-controlled",
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.provider).toBe("daraja");
    expect(initiateStkPush).toHaveBeenCalledWith(expect.objectContaining({ shortcode: "100200", partyB: "100200", amount: 1200 }));
    expect(insertedPayments[0]).toMatchObject({ provider: "daraja", ownerId, paymentRail: "property_owner_invoice_daraja" });
    expect(insertedPayments[0]).not.toHaveProperty("destination", "attacker-controlled");
  });
});

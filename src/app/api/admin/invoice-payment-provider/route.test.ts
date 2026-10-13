import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { settings } = vi.hoisted(() => ({ settings: { provider: "kopokopo" as string } }));
vi.mock("@/lib/mongodb", () => ({
  connectToDatabase: async () => ({
    db: {
      collection: (name: string) => name === "platformSettings"
        ? {
            findOne: async () => ({ _id: "property_owner_invoice_payments", provider: settings.provider }),
            updateOne: async (_filter: unknown, update: any) => { settings.provider = update.$set.provider; },
          }
        : { insertOne: async () => ({ acknowledged: true }) },
    },
  }),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfToken: vi.fn(async () => true),
  buildInvalidCsrfResponse: vi.fn(() => new Response("Invalid CSRF", { status: 403 })),
}));
vi.mock("@/lib/kopokopo", () => ({ assertKopokopoInvoicePaymentConfigured: vi.fn() }));
vi.mock("@/lib/mpesa", () => ({ resolveDarajaPlatformStkCredentials: vi.fn() }));

function request(role: string, body?: unknown) {
  return {
    headers: new Headers({ "x-csrf-token": "csrf" }),
    cookies: {
      get: (name: string) => ({ role, userId: "admin-1", "csrf-token": "csrf" }[name] ? { value: ({ role, userId: "admin-1", "csrf-token": "csrf" } as Record<string, string>)[name] } : undefined),
    },
    json: async () => body,
  } as unknown as NextRequest;
}

describe("admin invoice payment provider setting", () => {
  it("persists A→B→A switches and rejects invalid and unauthorized changes", async () => {
    settings.provider = "kopokopo";
    const { GET, PUT } = await import("@/app/api/admin/invoice-payment-provider/route");

    const getInitial = await GET(request("admin"));
    expect((await getInitial.json()).provider).toBe("kopokopo");

    const switchToDaraja = await PUT(request("admin", { provider: "daraja" }));
    expect((await switchToDaraja.json()).provider).toBe("daraja");
    expect((await GET(request("admin")).then((response) => response.json())).provider).toBe("daraja");

    const switchBack = await PUT(request("admin", { provider: "kopokopo" }));
    expect((await switchBack.json()).provider).toBe("kopokopo");
    expect((await GET(request("admin")).then((response) => response.json())).provider).toBe("kopokopo");

    expect((await PUT(request("admin", { provider: "stripe" }))).status).toBe(400);
    expect((await PUT(request("propertyOwner", { provider: "daraja" }))).status).toBe(401);
    expect(settings.provider).toBe("kopokopo");
  });
});

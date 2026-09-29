import { describe, expect, it } from "vitest";
import { getOwnerInvoicePaymentProvider } from "@/lib/owner-integrations";

function dbWith(doc: Record<string, unknown>) {
  return {
    collection: () => ({
      findOne: async () => doc,
    }),
  } as any;
}

describe("invoice payment provider configuration", () => {
  it("reads the canonical provider setting", async () => {
    await expect(getOwnerInvoicePaymentProvider(dbWith({ provider: "daraja" }), "")).resolves.toBe("daraja");
    await expect(getOwnerInvoicePaymentProvider(dbWith({ provider: "kopokopo" }), "")).resolves.toBe("kopokopo");
  });

  it("supports the legacy setting name and defaults safely", async () => {
    await expect(getOwnerInvoicePaymentProvider(dbWith({ invoicePaymentProvider: "daraja" }), "")).resolves.toBe("daraja");
    await expect(getOwnerInvoicePaymentProvider(dbWith({ provider: "unsupported" }), "")).resolves.toBe("kopokopo");
  });
});

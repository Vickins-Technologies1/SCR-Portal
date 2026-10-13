import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { payment, invoice, postVerifiedPayment, invoiceUpdates } = vi.hoisted(() => ({
  payment: { _id: { toString: () => "payment-1" }, invoiceId: "64a000000000000000000002", ownerId: "64a000000000000000000001", amount: 1200, status: "pending", provider: "daraja", paymentRail: "property_owner_invoice_daraja" } as Record<string, any>,
  invoice: { _id: "64a000000000000000000002", userId: "64a000000000000000000001", amount: 1200, status: "pending" } as Record<string, any>,
  postVerifiedPayment: vi.fn(),
  invoiceUpdates: [] as unknown[],
}));

vi.mock("@/lib/mongodb", () => ({
  connectToDatabase: async () => ({
    db: {
      collection: (name: string) => name === "payments"
        ? {
            findOne: async () => payment,
            findOneAndUpdate: async (_filter: unknown, update: any) => {
              Object.assign(payment, update.$set);
              return { value: payment };
            },
            updateOne: async (_filter: unknown, update: any) => { Object.assign(payment, update.$set); },
          }
        : name === "invoices"
          ? {
              findOne: async () => invoice,
              updateOne: async (...args: unknown[]) => { invoiceUpdates.push(args); },
            }
          : { updateOne: vi.fn() },
    },
  }),
}));
vi.mock("@/lib/verified-payment-posting", () => ({ postVerifiedPayment }));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

function request() {
  return {
    json: async () => ({
      Body: { stkCallback: {
        MerchantRequestID: "merchant-1",
        CheckoutRequestID: "checkout-1",
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: { Item: [{ Name: "Amount", Value: 1200 }, { Name: "MpesaReceiptNumber", Value: "Q123456789" }] },
      } },
    }),
  } as unknown as NextRequest;
}

describe("owner invoice Daraja callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payment.status = "pending";
    payment.financialPostingStatus = undefined;
    invoiceUpdates.length = 0;
    postVerifiedPayment.mockResolvedValue({ outcome: "posted", payment });
  });

  it("sends a verified success through shared posting and does not set invoice status directly", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(postVerifiedPayment).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: payment._id,
      providerConfirmedAmount: 1200,
      providerTransactionId: "checkout-1",
      providerReceipt: "Q123456789",
    }));
    expect(invoiceUpdates).toHaveLength(0);
  });
});

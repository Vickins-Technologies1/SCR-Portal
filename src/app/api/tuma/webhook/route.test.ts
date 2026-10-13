import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const insertOne = vi.fn();
vi.mock("@/lib/mongodb", () => ({ connectToDatabase: async () => ({ db: { collection: () => ({ insertOne }) } }) }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";

describe("Tuma webhook authenticity boundary", () => {
  beforeEach(() => insertOne.mockClear());

  it("stores sanitized event metadata and does not match or post payments", async () => {
    const response = await POST(new NextRequest("https://example.test/api/tuma/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payment_id: "p-1", status: "completed", amount: 10, phone: "+254712345678", mpesa_receipt_number: "R-1" }),
    }));
    expect(response.status).toBe(200);
    expect(insertOne).toHaveBeenCalledTimes(1);
    const record = insertOne.mock.calls[0][0];
    expect(record).toMatchObject({ authenticityVerified: false, paymentMatched: false, processingStatus: "held_for_reconciliation" });
    expect(record.phoneNumber).toBe("***5678");
    expect(record).not.toHaveProperty("rawBody");
  });
});

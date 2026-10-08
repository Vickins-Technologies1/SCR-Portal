import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendWelcomeSms } from "./sms";

describe("sendWelcomeSms", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BLESSEDTEXTS_API_KEY;
  const originalSenderId = process.env.BLESSEDTEXTS_SENDER_ID;

  beforeEach(() => {
    process.env.BLESSEDTEXTS_API_KEY = "test-api-key";
    process.env.BLESSEDTEXTS_SENDER_ID = "MYRENT";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status_code: "1000", status_desc: "Success", message_id: "message-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.BLESSEDTEXTS_API_KEY;
    else process.env.BLESSEDTEXTS_API_KEY = originalApiKey;
    if (originalSenderId === undefined) delete process.env.BLESSEDTEXTS_SENDER_ID;
    else process.env.BLESSEDTEXTS_SENDER_ID = originalSenderId;
    vi.restoreAllMocks();
  });

  it.each([
    "Short rent reminder.",
    "A".repeat(161),
    "A complete payment notice with tenant, property, unit, balance, reference, due date, and contact details. ".repeat(8),
  ])("sends the complete message in one provider request", async (message) => {
    await sendWelcomeSms({ phone: "0712345678", message });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body)).message).toBe(message);
  });

  it("preserves Unicode and SMS punctuation", async () => {
    const message = "Dear José & Aïda — KSh 15,000 / Unit A-102 (paid). Ref: PAY-2026/10/08 😊";

    await sendWelcomeSms({ phone: "0712345678", message });

    const [, request] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body)).message).toBe(message);
  });
});

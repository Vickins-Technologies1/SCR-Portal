import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.fn();
const error = vi.fn();
const warn = vi.fn();
vi.mock("./logger", () => ({ default: { info: (...args: unknown[]) => info(...args), error: (...args: unknown[]) => error(...args), warn: (...args: unknown[]) => warn(...args) } }));

import { sendOtpSms } from "./sms";

describe("sendOtpSms logging", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.BLESSEDTEXTS_API_KEY = "test-provider-key";
    process.env.BLESSEDTEXTS_SENDER_ID = "TEST";
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ status_code: "1000", status_desc: "OK", message_id: "safe-id" }), { status: 200 })) as typeof fetch;
    info.mockClear(); error.mockClear(); warn.mockClear();
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("sends successfully without logging the OTP or message body", async () => {
    await sendOtpSms({ phone: "0712345678", code: "928164" });
    const logged = JSON.stringify([info.mock.calls, error.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain("928164");
    expect(logged).not.toContain("verification code");
    expect(logged).not.toContain("0712345678");
  });

  it("does not log provider payloads or sensitive error contents on failure", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ status_code: "9000", status_desc: "OTP 928164 rejected" }), { status: 200 })) as typeof fetch;
    await expect(sendOtpSms({ phone: "0712345678", code: "928164" })).rejects.toThrow("delivery failed");
    const logged = JSON.stringify([info.mock.calls, error.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain("928164");
    expect(logged).not.toContain("OTP");
    expect(logged).not.toContain("0712345678");
  });
});

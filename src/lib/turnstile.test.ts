import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const originalEnv = {
  secret: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
  hostnames: process.env.TURNSTILE_EXPECTED_HOSTNAMES,
};

afterEach(() => {
  vi.restoreAllMocks();
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalEnv.secret;
  process.env.TURNSTILE_EXPECTED_HOSTNAMES = originalEnv.hostnames;
});

function request(body?: unknown) {
  return new Request("https://myaccuraterent.com/api/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("verifyTurnstile", () => {
  it("rejects a missing token without calling Cloudflare", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await verifyTurnstile(request({}), "login")).toEqual({ ok: false, reason: "missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only a successful response with the expected hostname and action", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "test-secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAMES = "myaccuraterent.com,www.myaccuraterent.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: "myaccuraterent.com",
      action: "login",
    }), { status: 200 }));

    expect(await verifyTurnstile(request({ turnstileToken: "single-use-token" }), "login")).toEqual({ ok: true });
  });

  it("rejects wrong action, wrong hostname, and service failures", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "test-secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAMES = "myaccuraterent.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, hostname: "myaccuraterent.com", action: "signup",
    }), { status: 200 }));
    expect(await verifyTurnstile(request({ turnstileToken: "token" }), "login")).toEqual({ ok: false, reason: "invalid" });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect(await verifyTurnstile(request({ turnstileToken: "token" }), "login")).toEqual({ ok: false, reason: "unavailable" });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, hostname: "attacker.example", action: "login",
    }), { status: 200 }));
    expect(await verifyTurnstile(request({ turnstileToken: "token" }), "login")).toEqual({ ok: false, reason: "invalid" });
  });

  it("fails closed for expired/reused tokens and timeouts", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "test-secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAMES = "myaccuraterent.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      success: false, "error-codes": ["timeout-or-duplicate"],
    }), { status: 200 }));
    expect(await verifyTurnstile(request({ turnstileToken: "already-used" }), "login")).toEqual({ ok: false, reason: "invalid" });

    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("timed out"));
    expect(await verifyTurnstile(request({ turnstileToken: "token" }), "login")).toEqual({ ok: false, reason: "unavailable" });
  });
});

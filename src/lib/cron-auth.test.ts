import { beforeEach, describe, expect, it } from "vitest";
import { authorizeCronRequest } from "./cron-auth";

describe("authorizeCronRequest", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "a-test-cron-secret";
    delete process.env.VERCEL_CRON_SECRET;
  });

  it("rejects missing and incorrect bearer credentials", () => {
    expect(authorizeCronRequest(new Request("https://example.test/api/cron"))).toMatchObject({ authorized: false, status: 401 });
    expect(authorizeCronRequest(new Request("https://example.test/api/cron", { headers: { authorization: "Bearer wrong" } }))).toMatchObject({ authorized: false, status: 401 });
  });

  it("accepts Vercel's bearer authorization header", () => {
    expect(authorizeCronRequest(new Request("https://example.test/api/cron", { headers: { authorization: "Bearer a-test-cron-secret" } }))).toEqual({ authorized: true });
  });

  it("fails closed when no server secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCronRequest(new Request("https://example.test/api/cron"))).toMatchObject({ authorized: false, status: 503 });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { authorizeCronRequest } from "./cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("cron authorization", () => {
  it("rejects requests when no server secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCronRequest(new Request("http://localhost/api/cron/test"))).toMatchObject({
      authorized: false,
      status: 503,
    });
  });

  it("requires the configured bearer secret", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    expect(authorizeCronRequest(new Request("http://localhost/api/cron/test"))).toMatchObject({ authorized: false, status: 401 });
    expect(authorizeCronRequest(new Request("http://localhost/api/cron/test", {
      headers: { authorization: "Bearer test-cron-secret" },
    }))).toEqual({ authorized: true });
  });
});

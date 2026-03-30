import { describe, expect, it, vi } from "vitest";
import { withCsrfRetry } from "./csrf-client";

describe("withCsrfRetry", () => {
  it("returns the first response when status is not 403", async () => {
    const response = new Response(null, { status: 200 });
    const makeRequest = vi.fn().mockResolvedValue(response);
    const refreshToken = vi.fn().mockResolvedValue("new-token");

    const result = await withCsrfRetry("token", makeRequest, refreshToken);

    expect(result).toBe(response);
    expect(makeRequest).toHaveBeenCalledTimes(1);
    expect(makeRequest).toHaveBeenCalledWith("token");
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it("retries with refreshed token after a 403", async () => {
    const forbidden = new Response(null, { status: 403 });
    const ok = new Response(null, { status: 200 });
    const makeRequest = vi.fn().mockResolvedValueOnce(forbidden).mockResolvedValueOnce(ok);
    const refreshToken = vi.fn().mockResolvedValue("refreshed-token");

    const result = await withCsrfRetry("token", makeRequest, refreshToken);

    expect(result).toBe(ok);
    expect(makeRequest).toHaveBeenCalledTimes(2);
    expect(makeRequest).toHaveBeenNthCalledWith(1, "token");
    expect(makeRequest).toHaveBeenNthCalledWith(2, "refreshed-token");
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("returns the original response if refresh fails", async () => {
    const forbidden = new Response(null, { status: 403 });
    const makeRequest = vi.fn().mockResolvedValue(forbidden);
    const refreshToken = vi.fn().mockResolvedValue(null);

    const result = await withCsrfRetry("token", makeRequest, refreshToken);

    expect(result).toBe(forbidden);
    expect(makeRequest).toHaveBeenCalledTimes(1);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });
});

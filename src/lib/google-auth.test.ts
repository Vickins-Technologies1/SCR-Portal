import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeGoogleCodeForProfile } from "./google-auth";

describe("exchangeGoogleCodeForProfile email verification", () => {
  const previousEnv = {
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    jwtSecret: process.env.JWT_SECRET,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousEnv.googleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousEnv.googleClientId;
    if (previousEnv.googleClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousEnv.googleClientSecret;
    if (previousEnv.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousEnv.jwtSecret;
  });

  it("does not treat a string false verification flag as verified", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.JWT_SECRET = "google-auth-test-secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "google-user-id",
        email: "person@example.test",
        verified_email: "false",
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const profile = await exchangeGoogleCodeForProfile({ code: "authorization-code", redirectUri: "https://example.test/callback" });

    expect(profile.emailVerified).toBe(false);
  });
});

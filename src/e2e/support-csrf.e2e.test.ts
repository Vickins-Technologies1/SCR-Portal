import { describe, expect, it } from "vitest";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;

type CookieJar = Map<string, string>;

const applyCookies = (jar: CookieJar, res: Response) => {
  const headerAny = res.headers as unknown as { getSetCookie?: () => string[] };
  const setCookies = headerAny.getSetCookie?.() || [];
  const fallback = res.headers.get("set-cookie");
  const cookieList = setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];
  for (const cookie of cookieList) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index > 0) {
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      jar.set(name, value);
    }
  }
};

const getSetCookies = (res: Response) => {
  const headerAny = res.headers as unknown as { getSetCookie?: () => string[] };
  const setCookies = headerAny.getSetCookie?.() || [];
  const fallback = res.headers.get("set-cookie");
  return setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];
};

const hasExpiredCookie = (cookie: string, name: string) =>
  cookie.startsWith(`${name}=`) && (/Max-Age=0/i.test(cookie) || /Expires=/i.test(cookie));

const cookieHeader = (jar: CookieJar) =>
  Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

describe("support CSRF middleware (E2E)", () => {
  if (!ownerEmail || !ownerPassword) {
    it.skip("requires E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD", () => {});
    return;
  }

  it(
    "rejects bad CSRF token and accepts refreshed token",
    async () => {
      const jar: CookieJar = new Map();

      const signinRes = await fetch(`${baseUrl}/api/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      });

      applyCookies(jar, signinRes);
      expect(signinRes.ok).toBe(true);
      const signinData = await signinRes.json();
      expect(signinData.success).toBe(true);

      const badRes = await fetch(`${baseUrl}/api/support/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": "bad-token",
          Cookie: cookieHeader(jar),
        },
        body: JSON.stringify({ message: `E2E CSRF ${Date.now()}` }),
      });

      expect(badRes.status).toBe(403);

      const csrfRes = await fetch(`${baseUrl}/api/csrf-token`, {
        headers: { Cookie: cookieHeader(jar) },
      });

      applyCookies(jar, csrfRes);
      expect(csrfRes.ok).toBe(true);
      const csrfData = await csrfRes.json();
      expect(csrfData.success).toBe(true);
      const csrfToken = csrfData.csrfToken as string;
      expect(typeof csrfToken).toBe("string");

      const goodRes = await fetch(`${baseUrl}/api/support/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
          Cookie: cookieHeader(jar),
        },
        body: JSON.stringify({ message: `E2E CSRF ${Date.now()}` }),
      });

      const goodData = await goodRes.json();
      expect(goodRes.ok).toBe(true);
      expect(goodData.success).toBe(true);

      const messageId = goodData.message?._id;
      if (messageId) {
        const deleteRes = await fetch(`${baseUrl}/api/support/messages`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
            Cookie: cookieHeader(jar),
          },
          body: JSON.stringify({ messageId }),
        });
        const deleteData = await deleteRes.json();
        expect(deleteRes.ok).toBe(true);
        expect(deleteData.success).toBe(true);
      }
    },
    30000
  );

  it(
    "logs out and clears cookies on invalid CSRF token",
    async () => {
      const jar: CookieJar = new Map();

      const signinRes = await fetch(`${baseUrl}/api/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      });

      applyCookies(jar, signinRes);
      expect(signinRes.ok).toBe(true);

      const badRes = await fetch(`${baseUrl}/api/support/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": "bad-token",
          Cookie: cookieHeader(jar),
        },
        body: JSON.stringify({ message: `E2E CSRF logout ${Date.now()}` }),
      });

      expect(badRes.status).toBe(403);
      const badData = await badRes.json();
      expect(badData.logout).toBe(true);
      expect(badData.redirect).toBe("/");

      const setCookies = getSetCookies(badRes);
      expect(setCookies.some((cookie) => hasExpiredCookie(cookie, "session"))).toBe(true);
      expect(setCookies.some((cookie) => hasExpiredCookie(cookie, "userId"))).toBe(true);
      expect(setCookies.some((cookie) => hasExpiredCookie(cookie, "role"))).toBe(true);
      expect(setCookies.some((cookie) => hasExpiredCookie(cookie, "csrf-token"))).toBe(true);
    },
    30000
  );
});

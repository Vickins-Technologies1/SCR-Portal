import "server-only";

import { timingSafeEqual } from "node:crypto";

export type CronAuthorization =
  | { authorized: true }
  | { authorized: false; status: 401 | 503; message: string };

/**
 * Vercel sends the configured CRON_SECRET as a bearer token. Fail closed when
 * the secret is missing so a public deployment cannot expose a bulk sender by
 * accident. The secret is read only on the server and is never logged.
 */
export function authorizeCronRequest(request: Request): CronAuthorization {
  const expected = String(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || "").trim();
  if (!expected) {
    return { authorized: false, status: 503, message: "Scheduled job is not configured" };
  }

  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  const matches = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
  return matches
    ? { authorized: true }
    : { authorized: false, status: 401, message: "Unauthorized" };
}

import { describe, expect, it } from "vitest";
import { matchesSessionIdentity, type SessionPayload } from "./session";

describe("matchesSessionIdentity", () => {
  const ownerSession = { sub: "owner-1", role: "propertyOwner" } as SessionPayload;

  it("accepts only a verified session for the requested account and role", () => {
    expect(matchesSessionIdentity(ownerSession, "owner-1")).toBe(true);
    expect(matchesSessionIdentity(ownerSession, "owner-1", "propertyOwner")).toBe(true);
  });

  it("rejects missing sessions and account or role mismatches", () => {
    expect(matchesSessionIdentity(null, "owner-1")).toBe(false);
    expect(matchesSessionIdentity(ownerSession, "tenant-1")).toBe(false);
    expect(matchesSessionIdentity(ownerSession, "owner-1", "tenant")).toBe(false);
  });
});

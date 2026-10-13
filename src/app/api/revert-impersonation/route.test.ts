import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import { POST } from "./route";

function buildRequest(cookie: string) {
  return new NextRequest(new URL("http://localhost/api/revert-impersonation"), {
    method: "POST",
    headers: { cookie },
  });
}

describe("/api/revert-impersonation", () => {
  it("redirects Airbnb owners back to /airbnb-dashboard", async () => {
    process.env.JWT_SECRET = "test-secret";
    const token = await createSessionToken({
      sub: "owner-1",
      role: "propertyOwner",
      ownerId: "owner-1",
      managementType: "airbnb",
      impersonatedTenantId: "tenant-1",
      preImpersonationExpiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      impersonator: { userId: "admin-1", role: "admin" },
    });

    const res = await POST(buildRequest(`session=${token}`));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, redirect: "/airbnb-dashboard" });
    const restored = await verifySessionToken(res.cookies.get("session")?.value || "");
    expect(restored).toMatchObject({ sub: "owner-1", role: "propertyOwner", impersonator: { userId: "admin-1", role: "admin" } });
    expect(restored?.impersonatedTenantId).toBeUndefined();
  });

  it("redirects rentals owners back to /property-owner-dashboard", async () => {
    process.env.JWT_SECRET = "test-secret";
    const token = await createSessionToken({
      sub: "owner-2",
      role: "propertyOwner",
      ownerId: "owner-2",
      managementType: "rentals",
      impersonatedTenantId: "tenant-2",
      preImpersonationExpiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    });

    const res = await POST(buildRequest(`session=${token}`));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, redirect: "/property-owner-dashboard" });
  });

  it("rejects a browser-cookie-only impersonation flag", async () => {
    process.env.JWT_SECRET = "test-secret";
    const token = await createSessionToken({
      sub: "owner-3",
      role: "propertyOwner",
      ownerId: "owner-3",
    });

    const res = await POST(buildRequest(`session=${token}; managementType=airbnb`));
    const json = await res.json();

    expect(json).toMatchObject({ success: false, message: "No tenant impersonation session" });
  });
});


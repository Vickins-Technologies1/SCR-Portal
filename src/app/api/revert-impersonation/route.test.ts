import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/session";
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
    });

    const res = await POST(buildRequest(`session=${token}`));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, redirect: "/airbnb-dashboard" });
  });

  it("redirects rentals owners back to /property-owner-dashboard", async () => {
    process.env.JWT_SECRET = "test-secret";
    const token = await createSessionToken({
      sub: "owner-2",
      role: "propertyOwner",
      ownerId: "owner-2",
      managementType: "rentals",
    });

    const res = await POST(buildRequest(`session=${token}`));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, redirect: "/property-owner-dashboard" });
  });

  it("falls back to managementType cookie when session is missing it", async () => {
    process.env.JWT_SECRET = "test-secret";
    const token = await createSessionToken({
      sub: "owner-3",
      role: "propertyOwner",
      ownerId: "owner-3",
    });

    const res = await POST(buildRequest(`session=${token}; managementType=airbnb`));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, redirect: "/airbnb-dashboard" });
  });
});


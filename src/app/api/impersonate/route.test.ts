import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const findOne = vi.fn();
const insertOne = vi.fn();
vi.mock("@/lib/mongodb", () => ({ connectToDatabase: async () => ({ db: { collection: () => ({ findOne, insertOne }) } }) }));

import { POST } from "./route";

describe("owner-to-tenant impersonation session", () => {
  const ownerId = new ObjectId().toString();
  const tenantId = new ObjectId().toString();

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    findOne.mockReset();
    findOne.mockImplementation(async (query: any) => {
      if (query.role === "propertyOwner") return { _id: new ObjectId(ownerId), role: "propertyOwner", managementType: "rentals" };
      if (query.ownerId === ownerId) return { _id: new ObjectId(tenantId), ownerId, role: "tenant", accountType: "tenant" };
      return null;
    });
  });

  it("signs the target into the session while retaining the real administrator actor", async () => {
    const session = await createSessionToken({
      sub: ownerId,
      role: "propertyOwner",
      ownerId,
      impersonator: { userId: new ObjectId().toString(), role: "admin" },
    });
    const response = await POST(new NextRequest("https://example.test/api/impersonate", {
      method: "POST",
      headers: { cookie: `session=${session}; csrf-token=csrf-value`, "x-csrf-token": "csrf-value", "content-type": "application/json" },
      body: JSON.stringify({ tenantId }),
    }));
    expect(response.status).toBe(200);
    const newToken = response.cookies.get("session")?.value;
    const refreshed = await verifySessionToken(newToken || "");
    expect(refreshed).toMatchObject({ sub: ownerId, role: "propertyOwner", impersonatedTenantId: tenantId, impersonator: { userId: expect.any(String), role: "admin" } });
    expect(response.cookies.get("session")?.httpOnly).toBe(true);
  });

  it("rejects a target tenant outside the signed-in owner's scope", async () => {
    findOne.mockImplementation(async (query: any) => query.role === "propertyOwner"
      ? { _id: new ObjectId(ownerId), role: "propertyOwner" }
      : null);
    const session = await createSessionToken({ sub: ownerId, role: "propertyOwner", ownerId });
    const response = await POST(new NextRequest("https://example.test/api/impersonate", {
      method: "POST",
      headers: { cookie: `session=${session}; csrf-token=csrf-value`, "x-csrf-token": "csrf-value", "content-type": "application/json" },
      body: JSON.stringify({ tenantId }),
    }));
    expect(response.status).toBe(404);
    expect(response.cookies.get("session")).toBeUndefined();
  });
});

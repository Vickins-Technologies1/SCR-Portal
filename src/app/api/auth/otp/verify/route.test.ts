import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { hashOtpCode } from "@/lib/otp";
import { verifySessionToken } from "@/lib/session";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/lib/auth-rate-limit", () => ({ requireAuthRateLimit: async () => null }));

import { POST } from "./route";

function matchesValue(actual: any, expected: any): boolean {
  if (expected instanceof ObjectId) return actual?.toString?.() === expected.toString();
  if (expected && typeof expected === "object" && "$ne" in expected) return !matchesValue(actual, expected.$ne);
  return actual === expected || actual?.toString?.() === expected?.toString?.();
}

function matches(doc: any, query: any): boolean {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return expected.some((clause: any) => matches(doc, clause));
    return matchesValue(doc[key], expected);
  });
}

function makeTestDb(seed: Record<string, any[]>) {
  const collections = { ...seed } as Record<string, any[]>;
  const db = {
    collection(name: string) {
      collections[name] ??= [];
      const docs = collections[name];
      return {
        async findOne(query: any) {
          return docs.find((doc) => matches(doc, query)) ?? null;
        },
        async updateOne(query: any, update: any) {
          const doc = docs.find((item) => matches(item, query));
          if (!doc) return { matchedCount: 0 };
          Object.assign(doc, update.$set ?? {});
          return { matchedCount: 1 };
        },
        async deleteOne(query: any) {
          const index = docs.findIndex((doc) => matches(doc, query));
          if (index >= 0) docs.splice(index, 1);
        },
      };
    },
  };
  return { collections, db };
}

function makeChallenge(params: { userId: string; otpId: ObjectId; ownerId: ObjectId }) {
  return {
    _id: params.otpId,
    userId: params.userId,
    role: "teamMember",
    isTeamMember: true,
    isOwner: false,
    ownerId: params.ownerId.toString(),
    email: "team@example.test",
    phone: "+254712345678",
    purpose: "login",
    codeHash: hashOtpCode("123456"),
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    redirectPath: "/property-owner-dashboard",
    collection: "teamMembers",
  };
}

describe("team member OTP verification", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "otp-team-member-test-secret";
    mocks.connect.mockReset();
  });

  it("creates a team member session with the member permissions and current owner context", async () => {
    const memberId = new ObjectId();
    const ownerId = new ObjectId();
    const otpId = new ObjectId();
    const member = {
      _id: memberId,
      ownerId,
      email: "team@example.test",
      role: "teamMember",
      teamRole: "accountant",
      active: true,
      permissions: ["payments:view"],
    };
    const { db } = makeTestDb({
      otpChallenges: [makeChallenge({ userId: memberId.toString(), otpId, ownerId })],
      teamMembers: [member],
      propertyOwners: [{ _id: ownerId, role: "propertyOwner", managementType: "airbnb", tier: "free" }],
    });
    mocks.connect.mockResolvedValue({ db });

    const response = await POST(new Request("https://example.test/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ otpId: otpId.toString(), code: "123456" }),
    }));
    const result = await response.json();
    const session = await verifySessionToken(response.cookies.get("session")?.value ?? "");

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ success: true, userId: memberId.toString(), role: "teamMember", isTeamMember: true, redirect: "/airbnb-dashboard", permissions: ["payments:view"] });
    expect(session).toMatchObject({ sub: memberId.toString(), role: "teamMember", ownerId: ownerId.toString(), managementType: "airbnb", tier: "free" });
    expect(response.cookies.get("ownerId")?.value).toBe(ownerId.toString());
    expect(JSON.parse(response.cookies.get("permissions")?.value ?? "[]")).toEqual(["payments:view"]);
  });

  it("rejects and consumes an OTP if the team member was revoked after challenge creation", async () => {
    const memberId = new ObjectId();
    const ownerId = new ObjectId();
    const otpId = new ObjectId();
    const { collections, db } = makeTestDb({
      otpChallenges: [makeChallenge({ userId: memberId.toString(), otpId, ownerId })],
      teamMembers: [{ _id: memberId, ownerId, role: "teamMember", active: false, permissions: ["payments:view"] }],
      propertyOwners: [{ _id: ownerId, role: "propertyOwner", managementType: "rentals" }],
    });
    mocks.connect.mockResolvedValue({ db });

    const response = await POST(new Request("https://example.test/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ otpId: otpId.toString(), code: "123456" }),
    }));
    const result = await response.json();

    expect(response.status).toBe(403);
    expect(result).toMatchObject({ success: false, code: "ACCOUNT_INACTIVE" });
    expect(response.cookies.get("session")).toBeUndefined();
    expect(collections.otpChallenges).toHaveLength(0);
  });
});

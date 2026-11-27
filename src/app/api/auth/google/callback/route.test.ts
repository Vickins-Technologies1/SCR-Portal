import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { verifySessionToken } from "@/lib/session";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  exchangeProfile: vi.fn(),
  shouldBypassOtp: vi.fn(() => true),
}));

vi.mock("@/lib/mongodb", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/lib/google-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-auth")>()),
  exchangeGoogleCodeForProfile: mocks.exchangeProfile,
}));
vi.mock("@/lib/otp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/otp")>()),
  shouldBypassOtp: mocks.shouldBypassOtp,
}));
vi.mock("@/lib/otp-delivery", () => ({ deliverOtp: vi.fn(async () => ({ message: "OTP sent" })) }));

import { createGoogleStateToken } from "@/lib/google-auth";
import { GET } from "./route";

type TestDb = { collections: Record<string, any[]>; db: any };

function matchesValue(actual: any, expected: any): boolean {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (expected instanceof ObjectId) return actual?.toString?.() === expected.toString();
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if ("$exists" in expected) return (actual !== undefined) === expected.$exists;
    if ("$ne" in expected) return !matchesValue(actual, expected.$ne);
  }
  return actual === expected || actual?.toString?.() === expected?.toString?.();
}

function matches(doc: any, query: any): boolean {
  return (Object.entries(query) as [string, any][]).every(([key, expected]) => {
    if (key === "$or") return expected.some((clause: any) => matches(doc, clause));
    if (key === "$and") return expected.every((clause: any) => matches(doc, clause));
    return matchesValue(doc[key], expected);
  });
}

function makeTestDb(seed: Record<string, any[]> = {}): TestDb {
  const collections: Record<string, any[]> = { ...seed };
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
          if (!doc) return { matchedCount: 0, modifiedCount: 0 };
          Object.assign(doc, update.$set ?? {});
          return { matchedCount: 1, modifiedCount: 1 };
        },
        async insertOne(doc: any) {
          const inserted = { ...doc, _id: doc._id ?? new ObjectId() };
          docs.push(inserted);
          return { insertedId: inserted._id };
        },
        async deleteMany(query: any) {
          const remaining = docs.filter((doc) => !matches(doc, query));
          docs.splice(0, docs.length, ...remaining);
        },
      };
    },
  };
  return { collections, db };
}

async function callback(params: {
  email: string;
  googleId?: string;
  portal?: "owner";
  action?: "login" | "signup";
  emailVerified?: boolean;
}) {
  const state = await createGoogleStateToken({
    portal: params.portal ?? "owner",
    action: params.action ?? "login",
    platform: "web",
  });
  mocks.exchangeProfile.mockResolvedValue({
    id: params.googleId ?? `google-${params.email}`,
    email: params.email,
    name: "Google Person",
    emailVerified: params.emailVerified ?? true,
  });
  return GET(new NextRequest(`https://example.test/api/auth/google/callback?code=code&state=${encodeURIComponent(state)}`));
}

describe("Google owner portal callback account resolution", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "google-callback-test-secret";
    mocks.connect.mockReset();
    mocks.exchangeProfile.mockReset();
    mocks.shouldBypassOtp.mockReset().mockReturnValue(true);
  });

  it("authenticates an existing team member in their owner context with stored role and permissions", async () => {
    const ownerId = new ObjectId();
    const memberId = new ObjectId();
    const member = {
      _id: memberId,
      ownerId,
      email: "staff@example.test",
      phone: "+254712345678",
      name: "Staff Member",
      role: "teamMember",
      teamRole: "manager",
      permissions: ["dashboard:view", "payments:view"],
      active: true,
      assignedPropertyIds: ["property-1"],
    };
    const { collections, db } = makeTestDb({
      propertyOwners: [{ _id: ownerId, role: "propertyOwner", managementType: "airbnb", tier: "free" }],
      teamMembers: [member],
    });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: member.email });
    const session = await verifySessionToken(response.cookies.get("session")?.value ?? "");

    expect(response.headers.get("location")).toBe("https://example.test/airbnb-dashboard");
    expect(session).toMatchObject({ sub: memberId.toString(), role: "teamMember", ownerId: ownerId.toString(), managementType: "airbnb", tier: "free" });
    expect(response.cookies.get("userId")?.value).toBe(memberId.toString());
    expect(response.cookies.get("role")?.value).toBe("teamMember");
    expect(response.cookies.get("ownerId")?.value).toBe(ownerId.toString());
    expect(JSON.parse(response.cookies.get("permissions")?.value ?? "[]")).toEqual(member.permissions);
    expect(collections.propertyOwners).toHaveLength(1);
    expect(collections.teamMembers[0]).toMatchObject({ role: "teamMember", teamRole: "manager", active: true, ownerId, assignedPropertyIds: ["property-1"], googleId: `google-${member.email}` });
  });

  it("keeps existing owner Google login working with owner role and dashboard", async () => {
    const ownerId = new ObjectId();
    const owner = {
      _id: ownerId,
      role: "propertyOwner",
      email: "owner@example.test",
      phone: "+254712345679",
      managementType: "rentals",
      tier: "premium",
    };
    const { db } = makeTestDb({ propertyOwners: [owner], teamMembers: [] });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: owner.email });
    const session = await verifySessionToken(response.cookies.get("session")?.value ?? "");

    expect(response.headers.get("location")).toBe("https://example.test/property-owner-dashboard");
    expect(session).toMatchObject({ sub: ownerId.toString(), role: "propertyOwner", ownerId: ownerId.toString() });
    expect(response.cookies.get("role")?.value).toBe("propertyOwner");
  });

  it("does not let the signup action skip OTP for an existing owner", async () => {
    const ownerId = new ObjectId();
    const owner = {
      _id: ownerId,
      role: "propertyOwner",
      email: "existing.owner@example.test",
      phone: "+254712345680",
      managementType: "rentals",
    };
    const { collections, db } = makeTestDb({ propertyOwners: [owner], teamMembers: [] });
    mocks.connect.mockResolvedValue({ db });
    mocks.shouldBypassOtp.mockReturnValue(false);

    const response = await callback({ email: owner.email, action: "signup" });
    const challenge = collections.otpChallenges[0];

    expect(response.headers.get("location")).toContain("/google-otp?otpId=");
    expect(response.cookies.get("session")).toBeUndefined();
    expect(challenge).toMatchObject({ userId: ownerId.toString(), role: "propertyOwner", collection: "propertyOwners", isOwner: true });
  });

  it("routes different team members to their own owner associations", async () => {
    const firstOwnerId = new ObjectId();
    const secondOwnerId = new ObjectId();
    const first = { _id: new ObjectId(), ownerId: firstOwnerId, email: "first@example.test", phone: "+254712345681", role: "teamMember", permissions: ["properties:view"], active: true };
    const second = { _id: new ObjectId(), ownerId: secondOwnerId, email: "second@example.test", phone: "+254712345682", role: "teamMember", permissions: ["reports:view"], active: true };
    const { db } = makeTestDb({
      propertyOwners: [
        { _id: firstOwnerId, role: "propertyOwner", managementType: "rentals", tier: "premium" },
        { _id: secondOwnerId, role: "propertyOwner", managementType: "airbnb", tier: "free" },
      ],
      teamMembers: [first, second],
    });
    mocks.connect.mockResolvedValue({ db });

    const firstResponse = await callback({ email: first.email });
    const firstSession = await verifySessionToken(firstResponse.cookies.get("session")?.value ?? "");
    const secondResponse = await callback({ email: second.email });
    const secondSession = await verifySessionToken(secondResponse.cookies.get("session")?.value ?? "");

    expect(firstSession).toMatchObject({ sub: first._id.toString(), ownerId: firstOwnerId.toString(), role: "teamMember" });
    expect(firstResponse.headers.get("location")).toBe("https://example.test/property-owner-dashboard");
    expect(secondSession).toMatchObject({ sub: second._id.toString(), ownerId: secondOwnerId.toString(), role: "teamMember" });
    expect(secondResponse.headers.get("location")).toBe("https://example.test/airbnb-dashboard");
  });

  it("does not create an owner for an unregistered Google login", async () => {
    const { collections, db } = makeTestDb({ propertyOwners: [], teamMembers: [] });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: "new.person@example.test" });

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("No owner or team member account");
    expect(collections.propertyOwners).toHaveLength(0);
    expect(response.cookies.get("session")).toBeUndefined();
  });

  it("uses the owner registration flow only for an explicit signup", async () => {
    const { collections, db } = makeTestDb({ propertyOwners: [], teamMembers: [], tenants: [], users: [], adminTeamMembers: [] });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: "new.owner@example.test", action: "signup" });

    expect(response.headers.get("location")).toContain("/complete-phone?token=");
    expect(collections.propertyOwners).toHaveLength(1);
    expect(collections.propertyOwners[0]).toMatchObject({ email: "new.owner@example.test", role: "propertyOwner" });
  });

  it("blocks inactive team members without creating an owner", async () => {
    const ownerId = new ObjectId();
    const member = { _id: new ObjectId(), ownerId, email: "revoked@example.test", role: "teamMember", active: false };
    const { collections, db } = makeTestDb({
      propertyOwners: [{ _id: ownerId, role: "propertyOwner", managementType: "rentals" }],
      teamMembers: [member],
    });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: member.email });

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("inactive");
    expect(response.cookies.get("session")).toBeUndefined();
    expect(collections.propertyOwners).toHaveLength(1);
  });

  it("does not replace a Google identity already linked to the existing team member", async () => {
    const ownerId = new ObjectId();
    const member = {
      _id: new ObjectId(),
      ownerId,
      email: "linked@example.test",
      googleId: "a-different-google-account",
      role: "teamMember",
      active: true,
    };
    const { collections, db } = makeTestDb({
      propertyOwners: [{ _id: ownerId, role: "propertyOwner", managementType: "rentals" }],
      teamMembers: [member],
    });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: member.email });

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("conflicting accounts");
    expect(member.googleId).toBe("a-different-google-account");
    expect(collections.propertyOwners).toHaveLength(1);
    expect(response.cookies.get("session")).toBeUndefined();
  });

  it("rejects an unverified Google email before linking or creating an account", async () => {
    const owner: { _id: ObjectId; role: string; email: string; phone: string; googleId?: string } = {
      _id: new ObjectId(),
      role: "propertyOwner",
      email: "unverified@example.test",
      phone: "+254712345683",
    };
    const { collections, db } = makeTestDb({ propertyOwners: [owner], teamMembers: [] });
    mocks.connect.mockResolvedValue({ db });

    const response = await callback({ email: owner.email, emailVerified: false });

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("verify this email");
    expect(owner.googleId).toBeUndefined();
    expect(collections.propertyOwners).toHaveLength(1);
    expect(response.cookies.get("session")).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { NextRequest } from "next/server";
import { GET } from "./route";

const { connectToDatabase, captured } = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  captured: { countQuery: null as Record<string, any> | null, pipeline: [] as Record<string, any>[] },
}));

vi.mock("../../../lib/mongodb", () => ({ connectToDatabase }));
vi.mock("../../../lib/logger", () => ({ default: { debug: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const ownerId = "64a000000000000000000001";
const propertyId = "64a000000000000000000002";

function request() {
  const cookies: Record<string, string> = { userId: ownerId, role: "propertyOwner" };
  return {
    url: "http://localhost/api/payments?page=1&limit=10",
    method: "GET",
    cookies: { get: (name: string) => cookies[name] ? { value: cookies[name] } : undefined },
  } as unknown as NextRequest;
}

describe("GET /api/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.countQuery = null;
    captured.pipeline = [];
    connectToDatabase.mockResolvedValue({
      db: {
        collection: (name: string) => {
          if (name === "properties") return { find: () => ({ toArray: async () => [{ _id: new ObjectId(propertyId) }] }) };
          if (name === "tenants") return { find: () => ({ toArray: async () => [] }) };
          if (name === "payments") return {
            countDocuments: async (query: Record<string, any>) => { captured.countQuery = query; return 0; },
            aggregate: (pipeline: Record<string, any>[]) => {
              captured.pipeline = pipeline;
              return { toArray: async () => [] };
            },
          };
          throw new Error(`Unexpected collection: ${name}`);
        },
      },
    });
  });

  it("excludes property owner invoice payments while preserving the owner property filter", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(captured.countQuery).toMatchObject({
      type: { $ne: "property_owner_invoice" },
      propertyId: { $in: [propertyId, new ObjectId(propertyId)] },
    });
    expect(captured.countQuery?.paymentRail?.$not).toEqual(/^property_owner_invoice(?:_|$)/);
    expect(captured.countQuery?.$or).toBeDefined();
    expect(captured.pipeline[0].$match).toEqual(captured.countQuery);
  });
});

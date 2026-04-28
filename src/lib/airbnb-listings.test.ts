import { describe, expect, it } from "vitest";
import { buildListingIdFilter, normalizeListingStatus } from "./airbnb-listings";
import { ObjectId } from "mongodb";

describe("normalizeListingStatus", () => {
  it("maps active -> published", () => {
    expect(normalizeListingStatus("active")).toBe("published");
    expect(normalizeListingStatus(" Active ")).toBe("published");
  });

  it("passes through known statuses", () => {
    expect(normalizeListingStatus("draft")).toBe("draft");
    expect(normalizeListingStatus("published")).toBe("published");
    expect(normalizeListingStatus("paused")).toBe("paused");
  });

  it("defaults to draft for unknown values", () => {
    expect(normalizeListingStatus("unknown")).toBe("draft");
    expect(normalizeListingStatus(null)).toBe("draft");
  });
});

describe("buildListingIdFilter", () => {
  it("includes ObjectId variant when listingId looks like an ObjectId", () => {
    const ownerId = "owner-1";
    const listingId = new ObjectId().toString();
    const filter = buildListingIdFilter(ownerId, listingId);
    expect(filter.ownerId).toBe(ownerId);
    expect(filter.$or[0]).toHaveProperty("_id");
  });

  it("supports string _id fallback when listingId is not an ObjectId", () => {
    const filter = buildListingIdFilter("owner-2", "lst-abc");
    expect(filter.$or).toEqual([{ externalId: "lst-abc" }, { _id: "lst-abc" }]);
  });
});


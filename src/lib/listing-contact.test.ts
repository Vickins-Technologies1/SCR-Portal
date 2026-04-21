import { describe, expect, it } from "vitest";
import { pickListingContactPhone } from "./listing-contact";

describe("pickListingContactPhone", () => {
  it("returns trimmed contactPhone when present", () => {
    expect(pickListingContactPhone({ contactPhone: "  +254700000000 " })).toBe("+254700000000");
  });

  it("falls back through known fields in order", () => {
    expect(pickListingContactPhone({ ownerPhone: "+254711111111" })).toBe("+254711111111");
    expect(pickListingContactPhone({ owner: { phone: "+254722222222" } })).toBe("+254722222222");
    expect(pickListingContactPhone({ contact: { phone: "+254733333333" } })).toBe("+254733333333");
    expect(pickListingContactPhone({ phone: "+254744444444" })).toBe("+254744444444");
  });

  it("returns undefined for blank or non-string values", () => {
    expect(pickListingContactPhone({ contactPhone: "   " })).toBeUndefined();
    expect(pickListingContactPhone({ contactPhone: 123 })).toBeUndefined();
    expect(pickListingContactPhone(null)).toBeUndefined();
    expect(pickListingContactPhone("not-an-object")).toBeUndefined();
  });
});


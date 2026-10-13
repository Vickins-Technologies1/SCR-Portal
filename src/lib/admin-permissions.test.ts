import { describe, expect, it } from "vitest";
import { adminPermissionsCover } from "./admin-permissions";

describe("adminPermissionsCover", () => {
  it("requires an exact grant so view never implies mutation", () => {
    expect(adminPermissionsCover("admin:payments:manage", ["admin:payments:view"])).toBe(false);
    expect(adminPermissionsCover("admin:owners:manage", ["admin:owners:view"])).toBe(false);
    expect(adminPermissionsCover("admin:team-members:manage", ["admin:team-members:view"])).toBe(false);
  });

  it("accepts only the exact scoped grant", () => {
    expect(adminPermissionsCover("admin:payments:manage", ["admin:payments:manage"])).toBe(true);
    expect(adminPermissionsCover("admin:payments:manage", ["admin:owners:manage"])).toBe(false);
    expect(adminPermissionsCover("admin:marketplace:manage", ["admin:marketplace:view"])).toBe(false);
    expect(adminPermissionsCover("admin:marketplace:manage", ["admin:marketplace:manage"])).toBe(true);
  });
});

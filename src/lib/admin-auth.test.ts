import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "./admin-auth";

describe("requireAdmin", () => {
  it("does not trust client-editable role and userId cookies without a signed session", async () => {
    const request = new NextRequest("https://example.test/api/admin/settings", {
      headers: { cookie: "role=admin; userId=507f1f77bcf86cd799439011" },
    });
    const result = await requireAdmin(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });
});

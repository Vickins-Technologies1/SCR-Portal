import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import * as mongo from "@/lib/mongodb";

// Smoke-test that our DELETE handlers return 404 cleanly when nothing is found,
// without throwing (we mock DB to avoid hitting a real database in unit tests).

describe("Airbnb cascade delete handlers", () => {
  it("bookings DELETE returns 404 when missing", async () => {
    vi.spyOn(mongo, "connectToDatabase").mockResolvedValue({
      db: {
        collection: () => ({
          findOneAndDelete: () => ({ value: null }),
          deleteMany: () => ({ deletedCount: 0 }),
        }),
      } as any,
      client: {
        startSession: () => ({
          withTransaction: async (fn: any) => fn(),
          endSession: async () => {},
        }),
      } as any,
    });

    const { DELETE } = await import("@/app/api/airbnb/bookings/route");
    const request = {
      url: "http://localhost/api/airbnb/bookings?bookingId=missing",
      headers: new Headers({ "x-csrf-token": "t" }),
      cookies: {
        get: (name: string) =>
          name === "csrf-token"
            ? { value: "t" }
            : name === "role"
              ? { value: "propertyOwner" }
              : name === "userId"
                ? { value: "owner-1" }
                : undefined,
      },
    } as unknown as NextRequest;

    const res = await DELETE(request);
    expect(res.status).toBe(404);
  }, 20000);
});

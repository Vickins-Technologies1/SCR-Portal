import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { claimWebhookEvent, completeWebhookEvent, releaseWebhookEvent } from "./webhook-idempotency";

describe("webhook event claims", () => {
  it("suppresses duplicate events and safely reclaims a failed event", async () => {
    const docs = new Map<string, any>();
    const collection = {
      insertOne: vi.fn(async (doc: any) => {
        if (docs.has(doc._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        docs.set(doc._id, { ...doc });
      }),
      findOne: vi.fn(async ({ _id }: any) => docs.get(_id) ?? null),
      updateOne: vi.fn(async (filter: any, update: any) => {
        const doc = docs.get(filter._id);
        if (!doc || doc.token !== filter.token) return { matchedCount: 0 };
        Object.assign(doc, update.$set);
        if (update.$unset) for (const key of Object.keys(update.$unset)) delete doc[key];
        if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) doc[key] = (doc[key] || 0) + Number(value);
        return { matchedCount: 1 };
      }),
    };
    const db = { collection: vi.fn(() => collection) } as any;

    const first = await claimWebhookEvent(db, "stripe", "evt_1");
    expect(first.claimed).toBe(true);
    expect(await claimWebhookEvent(db, "stripe", "evt_1")).toEqual({ claimed: false });
    if (!first.claimed) throw new Error("claim missing");
    await releaseWebhookEvent(db, "stripe", "evt_1", first.token);
    const retry = await claimWebhookEvent(db, "stripe", "evt_1");
    expect(retry.claimed).toBe(true);
    if (!retry.claimed) throw new Error("retry claim missing");
    await completeWebhookEvent(db, "stripe", "evt_1", retry.token);
    expect(await claimWebhookEvent(db, "stripe", "evt_1")).toEqual({ claimed: false });
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { withCronJobLock } from "./cron-lock";

describe("withCronJobLock", () => {
  it("allows one execution and rejects overlapping execution", async () => {
    let lock: { _id: string; token: string } | null = null;
    const collection = {
      findOneAndUpdate: vi.fn(async (_filter: unknown, update: any) => {
        if (lock) throw Object.assign(new Error("duplicate key"), { code: 11000 });
        lock = { _id: "test-job", token: update.$set.token };
        return { value: lock };
      }),
      deleteOne: vi.fn(async () => { lock = null; return { deletedCount: 1 }; }),
    };
    const db = { collection: vi.fn(() => collection) } as any;
    let finish!: () => void;
    const work = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

    const first = withCronJobLock(db, "test-job", work);
    await Promise.resolve();
    const second = await withCronJobLock(db, "test-job", work);
    expect(second).toEqual({ acquired: false });
    expect(work).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toEqual({ acquired: true, result: undefined });
    expect(collection.deleteOne).toHaveBeenCalledTimes(1);
  });
});

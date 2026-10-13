import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

const DEFAULT_CRON_LOCK_LEASE_MS = 10 * 60 * 1000;

export async function withCronJobLock<T>(
  db: Db,
  jobName: string,
  job: () => Promise<T>,
  leaseMs = DEFAULT_CRON_LOCK_LEASE_MS,
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const collection = db.collection<any>("cronJobLocks");
  const now = new Date();
  const token = randomUUID();
  let lock: any;
  try {
    const result = await collection.findOneAndUpdate(
      { _id: jobName, $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
      { $set: { token, expiresAt: new Date(now.getTime() + leaseMs), updatedAt: now } },
      { upsert: true, returnDocument: "after" },
    );
    lock = result?.value ?? result;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return { acquired: false };
    throw error;
  }

  if (!lock || lock.token !== token) return { acquired: false };
  const heartbeat = setInterval(() => {
    void collection.updateOne(
      { _id: jobName, token },
      { $set: { expiresAt: new Date(Date.now() + leaseMs), updatedAt: new Date() } },
    ).catch(() => undefined);
  }, Math.max(1_000, Math.floor(leaseMs / 3)));
  heartbeat.unref?.();
  try {
    return { acquired: true, result: await job() };
  } finally {
    clearInterval(heartbeat);
    await collection.deleteOne({ _id: jobName, token });
  }
}

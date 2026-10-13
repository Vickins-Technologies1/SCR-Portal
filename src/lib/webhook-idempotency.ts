import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export async function claimWebhookEvent(db: Db, provider: string, eventId: string, leaseMs = 5 * 60 * 1000) {
  const collection = db.collection<any>("webhookEventClaims");
  const _id = `${provider}:${eventId}`;
  const token = randomUUID();
  const now = new Date();
  try {
    await collection.insertOne({ _id, provider, eventId, token, state: "processing", leaseUntil: new Date(now.getTime() + leaseMs), attempts: 1, createdAt: now, updatedAt: now });
    return { claimed: true as const, token };
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
  }

  const existing = await collection.findOne({ _id });
  if (!existing || existing.state === "processed" || (existing.leaseUntil && new Date(existing.leaseUntil) > now)) {
    return { claimed: false as const };
  }
  const reclaimed = await collection.updateOne(
    { _id, token: existing.token, leaseUntil: existing.leaseUntil },
    { $set: { token, state: "processing", leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now }, $inc: { attempts: 1 } },
  );
  return reclaimed.matchedCount === 1 ? { claimed: true as const, token } : { claimed: false as const };
}

export async function completeWebhookEvent(db: Db, provider: string, eventId: string, token: string) {
  await db.collection<any>("webhookEventClaims").updateOne(
    { _id: `${provider}:${eventId}`, token, state: "processing" },
    { $set: { state: "processed", processedAt: new Date(), updatedAt: new Date() }, $unset: { leaseUntil: "" } },
  );
}

export async function releaseWebhookEvent(db: Db, provider: string, eventId: string, token: string) {
  await db.collection<any>("webhookEventClaims").updateOne(
    { _id: `${provider}:${eventId}`, token, state: "processing" },
    { $set: { state: "failed", leaseUntil: new Date(0), updatedAt: new Date() } },
  );
}

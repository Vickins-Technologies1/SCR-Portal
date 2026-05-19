import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveOwnerActivityActor } from "@/lib/owner-activity";

type ActivityDoc = {
  _id: ObjectId;
  ownerId: string;
  actor: {
    userId: string;
    role: string;
    ownerId: string;
    impersonator?: { userId: string; role: string } | null;
  };
  action: string;
  summary: string;
  entity?: { type: string; id?: string | null; label?: string | null } | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: Date;
  ip?: string | null;
  userAgent?: string | null;
};

function clampLimit(value: string | null) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(10, Math.min(100, Math.trunc(parsed)));
}

export async function GET(req: NextRequest) {
  const actor = await resolveOwnerActivityActor(req);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = clampLimit(searchParams.get("limit"));
  const cursor = searchParams.get("cursor");
  const actionPrefix = searchParams.get("actionPrefix");
  const queryText = searchParams.get("q");

  const filter: Record<string, unknown> = { ownerId: actor.ownerId };

  if (actionPrefix && typeof actionPrefix === "string" && actionPrefix.trim().length > 0) {
    filter.action = { $regex: `^${escapeRegex(actionPrefix.trim())}`, $options: "i" };
  }

  if (queryText && typeof queryText === "string" && queryText.trim().length > 0) {
    const safe = escapeRegex(queryText.trim());
    filter.$or = [
      { summary: { $regex: safe, $options: "i" } },
      { action: { $regex: safe, $options: "i" } },
      { "actor.userId": { $regex: safe, $options: "i" } },
      { "entity.type": { $regex: safe, $options: "i" } },
      { "entity.id": { $regex: safe, $options: "i" } },
      { "entity.label": { $regex: safe, $options: "i" } },
    ];
  }

  if (cursor && ObjectId.isValid(cursor)) {
    filter._id = { $lt: new ObjectId(cursor) };
  }

  const { db } = await connectToDatabase();
  // Best-effort: ensure query indexes exist (safe to call repeatedly).
  await db.collection("ownerActivityLogs").createIndex({ ownerId: 1, _id: -1 });
  const docs = await db
    .collection<ActivityDoc>("ownerActivityLogs")
    .find(filter)
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();

  const activities = docs.map((doc) => ({
    id: doc._id.toString(),
    occurredAt: doc.occurredAt?.toISOString?.() ?? null,
    action: doc.action,
    summary: doc.summary,
    actor: doc.actor,
    entity: doc.entity ?? null,
    metadata: doc.metadata ?? null,
    ip: doc.ip ?? null,
    userAgent: doc.userAgent ?? null,
  }));

  const nextCursor = docs.length ? docs[docs.length - 1]._id.toString() : null;

  return NextResponse.json(
    {
      success: true,
      activities,
      nextCursor,
    },
    { status: 200 }
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

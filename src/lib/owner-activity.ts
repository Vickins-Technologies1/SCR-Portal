import "server-only";

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "@/lib/session";

export type OwnerActivityActor = {
  userId: string;
  role: string;
  ownerId: string;
  impersonator?: { userId: string; role: string } | null;
};

export type OwnerActivityEntity = {
  type: string;
  id?: string | null;
  label?: string | null;
};

export type OwnerActivityEvent = {
  ownerId: string;
  actor: OwnerActivityActor;
  action: string;
  summary: string;
  entity?: OwnerActivityEntity | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
  ip?: string | null;
  userAgent?: string | null;
};

const COLLECTION = "ownerActivityLogs";

declare global {
  // eslint-disable-next-line no-var
  var _ownerActivityIndexesReady: boolean | undefined;
}

async function ensureIndexes(db: Db) {
  if (global._ownerActivityIndexesReady) return;
  await db.collection(COLLECTION).createIndex({ ownerId: 1, _id: -1 });
  await db.collection(COLLECTION).createIndex({ ownerId: 1, action: 1, _id: -1 });
  global._ownerActivityIndexesReady = true;
}

function coerceHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function resolveOwnerActivityActor(req: NextRequest): Promise<OwnerActivityActor | null> {
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const session: SessionPayload | null = sessionToken ? await verifySessionToken(sessionToken) : null;
  if (!session?.sub || !session?.role) return null;

  const role = String(session.role);
  const userId = String(session.sub);

  const ownerIdRaw = session.ownerId ?? null;
  const ownerId =
    role === "propertyOwner"
      ? userId
      : role === "teamMember"
        ? (typeof ownerIdRaw === "string" ? ownerIdRaw : null)
        : null;

  if (!ownerId) return null;

  return {
    userId,
    role,
    ownerId,
    impersonator: session.impersonator ?? null,
  };
}

export async function appendOwnerActivity(db: Db, event: OwnerActivityEvent) {
  await ensureIndexes(db);

  const occurredAt = event.occurredAt ?? new Date();
  const doc = {
    _id: new ObjectId(),
    ownerId: event.ownerId,
    actor: {
      userId: event.actor.userId,
      role: event.actor.role,
      ownerId: event.actor.ownerId,
      impersonator: event.actor.impersonator ?? null,
    },
    action: event.action,
    summary: event.summary,
    entity: event.entity ?? null,
    metadata: event.metadata ?? null,
    occurredAt,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
  };

  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function appendOwnerActivityFromRequest(
  db: Db,
  req: NextRequest,
  event: Omit<OwnerActivityEvent, "ownerId" | "actor" | "ip" | "userAgent" | "occurredAt"> & {
    occurredAt?: Date;
  }
) {
  const actor = await resolveOwnerActivityActor(req);
  if (!actor) return null;

  const ip =
    coerceHeaderValue(req.headers.get("x-forwarded-for")) ??
    coerceHeaderValue(req.headers.get("x-real-ip")) ??
    null;

  const userAgent = coerceHeaderValue(req.headers.get("user-agent"));

  return appendOwnerActivity(db, {
    ownerId: actor.ownerId,
    actor,
    action: event.action,
    summary: event.summary,
    entity: event.entity ?? null,
    metadata: event.metadata ?? null,
    occurredAt: event.occurredAt,
    ip,
    userAgent,
  });
}


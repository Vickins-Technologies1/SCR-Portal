// src/lib/owner-integrations.ts
import { Db, ObjectId } from "mongodb";

export type OwnerTumaIntegration = {
  enabled: boolean;
  email: string;
  apiKey: string;
};

export function maskSecret(secret?: string): string {
  const value = (secret || "").trim();
  if (!value) return "";
  if (value.length <= 6) return "******";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export async function getOwnerTumaIntegration(
  db: Db,
  ownerId: string
): Promise<OwnerTumaIntegration | null> {
  if (!ObjectId.isValid(ownerId)) return null;
  const doc = await db.collection("ownerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { tuma: 1 } }
  );

  const tuma = doc?.tuma || {};
  const email = String(tuma.email || "").trim();
  const apiKey = String(tuma.apiKey || "").trim();
  const enabled = tuma.enabled !== false;

  if (!enabled || !email || !apiKey) return null;
  return { enabled, email, apiKey };
}

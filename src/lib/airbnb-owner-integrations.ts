import { Db, ObjectId } from "mongodb";
import { decryptTumaApiKey, isLikelyEncryptedTumaApiKey } from "@/lib/tuma-crypto";

export type AirbnbOwnerTumaIntegration = {
  enabled: boolean;
  email: string;
  apiKey: string;
  businessId?: string;
};

export async function getAirbnbOwnerTumaIntegration(
  db: Db,
  ownerId: string
): Promise<AirbnbOwnerTumaIntegration | null> {
  if (!ObjectId.isValid(ownerId)) return null;

  const doc = await db.collection("airbnbOwnerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { tuma: 1 } }
  );

  const tuma = doc?.tuma || {};
  const email = String(tuma.email || "").trim();
  const storedApiKey = String(tuma.apiKey || "").trim();
  const enabled = tuma.enabled !== false;
  const businessId = String(tuma.businessId || "").trim() || undefined;

  let apiKey = storedApiKey;
  if (storedApiKey && isLikelyEncryptedTumaApiKey(storedApiKey)) {
    try {
      apiKey = decryptTumaApiKey(storedApiKey);
    } catch {
      apiKey = "";
    }
  }

  if (!enabled || !email || !apiKey) return null;
  return { enabled, email, apiKey, businessId };
}


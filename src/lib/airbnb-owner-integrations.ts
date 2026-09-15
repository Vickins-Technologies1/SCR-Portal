import { Db, ObjectId } from "mongodb";
import { decryptTumaApiKey, isLikelyEncryptedTumaApiKey } from "@/lib/tuma-crypto";

export type AirbnbOwnerTumaIntegration = {
  enabled: boolean;
  email: string;
  apiKey: string;
  businessId?: string;
};

/** The gateway selected for Airbnb booking collections. */
export type AirbnbPaymentGateway = "tuma" | "daraja";

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

/**
 * Read the owner's explicit payment-gateway choice. Older integrations did
 * not store a choice and used Tuma whenever it was configured, so retain that
 * behavior for those records while making all future routing explicit.
 */
export async function getAirbnbOwnerPaymentGateway(
  db: Db,
  ownerId: string
): Promise<AirbnbPaymentGateway> {
  if (!ObjectId.isValid(ownerId)) return "daraja";

  const record = await db.collection("airbnbOwnerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { paymentGateway: 1, tuma: 1 } }
  );
  const selected = String(record?.paymentGateway || "").trim().toLowerCase();
  if (selected === "tuma" || selected === "daraja") return selected;

  const tuma = record?.tuma || {};
  return tuma.enabled !== false && Boolean(String(tuma.email || "").trim() && String(tuma.apiKey || "").trim())
    ? "tuma"
    : "daraja";
}

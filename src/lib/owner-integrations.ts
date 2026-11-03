// src/lib/owner-integrations.ts
import { Db, ObjectId } from "mongodb";

export type OwnerPaymentGateway = "daraja" | "kopokopo";
export type OwnerInvoicePaymentProvider = "kopokopo" | "daraja";

export function maskSecret(secret?: string): string {
  const value = (secret || "").trim();
  if (!value) return "";
  if (value.length <= 6) return "******";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

/** Tuma has been removed; legacy selections now resolve to Daraja. */
export async function getOwnerPaymentGateway(db: Db, ownerId: string): Promise<OwnerPaymentGateway> {
  if (!ObjectId.isValid(ownerId)) return "daraja";
  const doc = await db.collection("ownerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { paymentGateway: 1 } }
  );
  return doc?.paymentGateway === "kopokopo" ? "kopokopo" : "daraja";
}

/** Provider for new My Accurate Rent invoice payments only. Kept separate from tenant routing. */
export async function getOwnerInvoicePaymentProvider(db: Db, ownerId: string): Promise<OwnerInvoicePaymentProvider> {
  void ownerId;
  const doc = await db.collection<any>("platformSettings").findOne(
    { _id: "property_owner_invoice_payments" },
    { projection: { provider: 1, invoicePaymentProvider: 1 } }
  );
  const configured = doc?.provider ?? doc?.invoicePaymentProvider;
  if (configured == null || String(configured).trim() === "") return "kopokopo";
  const selected = String(configured).trim().toLowerCase();
  if (selected === "daraja" || selected === "kopokopo") return selected;
  throw new Error("The configured invoice payment provider is unsupported. Ask an administrator to correct the setting.");
}

import "server-only";

import { Db } from "mongodb";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { connectMongoose } from "@/lib/mongoose";
import { getMpesaPasskey, getMpesaShortcode } from "@/lib/mpesa";
import { getOwnerDarajaIntegrations } from "@/lib/owner-daraja";

export type MpesaPaymentType = "paybill" | "till" | "bank";

export type ResolvedMpesaRouting = {
  source: "landlord" | "platform" | "owner_daraja";
  shortcode: string;
  passkey: string;
  paymentType: MpesaPaymentType;
  paymentAccountId?: string;
  routingKey?: string;
  label?: string;
  propertyIds?: string[];
  isDefault?: boolean;
  paybillNumber?: string;
  paybillAccountNumber?: string;
  tillNumber?: string;
  bank?: string;
  bankAccount?: string;
};

export type MpesaConnectionSummary = Omit<ResolvedMpesaRouting, "passkey"> & {
  hasPasskey: boolean;
};

type LandlordMpesaDoc = {
  _id?: { toString?: () => string } | string;
  landlord?: unknown;
  routingKey?: string;
  label?: string;
  propertyIds?: string[];
  enabled?: boolean;
  shortcode?: string;
  passkey?: string;
  paymentType?: MpesaPaymentType;
  paybillNumber?: string;
  paybillAccountNumber?: string;
  tillNumber?: string;
  bankBranchRef?: string;
  accountNumber?: string;
  isDefault?: boolean;
  status?: string;
  updatedAt?: string | Date;
  createdAt?: string | Date;
};

function isTruthyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePaymentType(doc?: LandlordMpesaDoc): MpesaPaymentType {
  if (doc?.paymentType === "bank") return "bank";
  if (doc?.paymentType === "till") return "till";
  if (doc?.paymentType === "paybill") return "paybill";
  if (isTruthyString(doc?.tillNumber)) return "till";
  if (isTruthyString(doc?.bankBranchRef)) return "bank";
  return "paybill";
}

function resolveShortcodeFromDoc(doc: LandlordMpesaDoc): string {
  const paymentType = normalizePaymentType(doc);
  if (paymentType === "bank") {
    return String(doc.bankBranchRef || doc.shortcode || "").trim();
  }
  if (paymentType === "till") {
    return String(doc.tillNumber || doc.shortcode || doc.paybillNumber || "").trim();
  }
  return String(doc.paybillNumber || doc.shortcode || doc.tillNumber || "").trim();
}

function toDocId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toString" in value && typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return "";
}

function matchesProperty(doc: LandlordMpesaDoc, propertyId?: string | null): boolean {
  const normalizedPropertyId = String(propertyId || "").trim();
  if (!normalizedPropertyId) return false;

  if (Array.isArray(doc.propertyIds) && doc.propertyIds.some((id) => String(id).trim() === normalizedPropertyId)) {
    return true;
  }

  return String((doc as { propertyId?: string }).propertyId || "").trim() === normalizedPropertyId;
}

function sortByPriority(a: LandlordMpesaDoc, b: LandlordMpesaDoc): number {
  const aDefault = a.isDefault === true ? 1 : 0;
  const bDefault = b.isDefault === true ? 1 : 0;
  if (aDefault !== bDefault) return bDefault - aDefault;

  const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;

  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bCreated - aCreated;
}

function resolveDarajaPlatformCredentials(): { shortcode: string; passkey: string; source: "mpesa" } {
  return {
    shortcode: getMpesaShortcode(),
    passkey: getMpesaPasskey(),
    source: "mpesa",
  };
}

function hasDarajaPlatformCredentials(): boolean {
  try {
    const credentials = resolveDarajaPlatformCredentials();
    return Boolean(credentials.shortcode && credentials.passkey);
  } catch {
    return false;
  }
}

function mapOwnerDarajaSharedToRouting(shared: {
  enabled: boolean;
  paymentType: "till" | "paybill" | "bank";
  destinationNumber: string;
  accountNumber: string;
  hasDestinationNumber: boolean;
}): ResolvedMpesaRouting | null {
  if (shared.enabled === false || !shared.hasDestinationNumber || !shared.destinationNumber.trim()) {
    return null;
  }

  const destinationNumber = shared.destinationNumber.trim();
  const paymentType = shared.paymentType;

  return {
    source: "owner_daraja",
    shortcode: destinationNumber,
    passkey: "",
    paymentType,
    paybillNumber: paymentType === "paybill" ? destinationNumber : undefined,
    tillNumber: paymentType === "till" ? destinationNumber : undefined,
    bank: paymentType === "bank" ? destinationNumber : undefined,
    bankAccount: paymentType === "bank" ? shared.accountNumber.trim() || undefined : undefined,
  };
}

/** Resolve where tenant M-Pesa payments should land — owner Integrations first, never platform till. */
export async function resolveOwnerTenantMpesaRouting(
  db: Db,
  input: { landlordId: string; propertyId?: string | null }
): Promise<ResolvedMpesaRouting> {
  const ownerDaraja = await getOwnerDarajaIntegrations(db, input.landlordId);
  const fromIntegrations = mapOwnerDarajaSharedToRouting(ownerDaraja.shared);
  if (fromIntegrations) {
    return fromIntegrations;
  }

  const landlordRouting = await resolveLandlordMpesaRouting(input);
  if (landlordRouting.source === "landlord") {
    return landlordRouting;
  }

  throw new Error(
    "Property owner has not configured M-Pesa receiving details. Ask the owner to set Till, Paybill, or Bank under Integrations → Mpesa."
  );
}

export async function resolveLandlordMpesaRouting(input: {
  landlordId: string;
  propertyId?: string | null;
  paymentType?: MpesaPaymentType | null;
}): Promise<ResolvedMpesaRouting> {
  await connectMongoose();

  const docs = (await LandlordMpesa.find({
    landlord: input.landlordId,
    enabled: { $ne: false },
    status: { $ne: "disconnected" },
    paymentType: { $in: ["paybill", "till", "bank"] },
  })
    .select({
      shortcode: 1,
      paymentType: 1,
      paybillNumber: 1,
      paybillAccountNumber: 1,
      tillNumber: 1,
      bankBranchRef: 1,
      accountNumber: 1,
      routingKey: 1,
      label: 1,
      propertyIds: 1,
      isDefault: 1,
      status: 1,
      updatedAt: 1,
      createdAt: 1,
    })
    .lean<LandlordMpesaDoc[]>()
    .exec()) as LandlordMpesaDoc[];

  const sortedDocs = [...docs].sort(sortByPriority);
  const propertyMatch = sortedDocs.find((doc) => matchesProperty(doc, input.propertyId));
  const paymentTypeMatch =
    input.paymentType && sortedDocs.find((doc) => normalizePaymentType(doc) === input.paymentType);
  const selectedDoc = propertyMatch || paymentTypeMatch || sortedDocs[0];

  if (selectedDoc) {
    let platformFallback: ReturnType<typeof resolveDarajaPlatformCredentials> | null = null;
    try {
      platformFallback = resolveDarajaPlatformCredentials();
    } catch {
      platformFallback = null;
    }

    const shortcode = resolveShortcodeFromDoc(selectedDoc) || platformFallback?.shortcode || "";
    // Shared landlord routing uses the passkey issued to the production Daraja app.
    // A shortcode alone does not authorize a different merchant passkey.
    const passkey = platformFallback?.passkey || "";

    if (shortcode && passkey) {
      return {
        source: "landlord",
        shortcode,
        passkey,
        paymentType: normalizePaymentType(selectedDoc),
        paymentAccountId: toDocId(selectedDoc._id),
        routingKey: String(selectedDoc.routingKey || "").trim() || undefined,
        label: String(selectedDoc.label || "").trim() || undefined,
        propertyIds: Array.isArray(selectedDoc.propertyIds) ? selectedDoc.propertyIds.map((id) => String(id).trim()).filter(Boolean) : undefined,
        isDefault: selectedDoc.isDefault === true,
        paybillNumber: String(selectedDoc.paybillNumber || "").trim() || undefined,
        paybillAccountNumber: String(selectedDoc.paybillAccountNumber || "").trim() || undefined,
        tillNumber: String(selectedDoc.tillNumber || "").trim() || undefined,
        bank: String(selectedDoc.bankBranchRef || "").trim() || undefined,
        bankAccount: String(selectedDoc.accountNumber || "").trim() || undefined,
      };
    }
  }

  const platform = resolveDarajaPlatformCredentials();
  return {
    source: "platform",
    shortcode: platform.shortcode,
    passkey: platform.passkey,
    paymentType: "paybill",
  };
}

export async function listLandlordMpesaConnections(input: {
  landlordId: string;
}): Promise<MpesaConnectionSummary[]> {
  await connectMongoose();

  const docs = (await LandlordMpesa.find({
    landlord: input.landlordId,
  })
    .select({
      shortcode: 1,
      paymentType: 1,
      paybillNumber: 1,
      paybillAccountNumber: 1,
      tillNumber: 1,
      bankBranchRef: 1,
      accountNumber: 1,
      routingKey: 1,
      label: 1,
      propertyIds: 1,
      isDefault: 1,
      enabled: 1,
      status: 1,
      updatedAt: 1,
      createdAt: 1,
    })
    .lean<LandlordMpesaDoc[]>()
    .exec()) as LandlordMpesaDoc[];

  return docs
    .sort(sortByPriority)
    .map((doc) => ({
      source: "landlord" as const,
      shortcode: resolveShortcodeFromDoc(doc),
      paymentType: normalizePaymentType(doc),
      paymentAccountId: toDocId(doc._id),
      routingKey: String(doc.routingKey || "").trim() || undefined,
      label: String(doc.label || "").trim() || undefined,
      propertyIds: Array.isArray(doc.propertyIds) ? doc.propertyIds.map((id) => String(id).trim()).filter(Boolean) : undefined,
      isDefault: doc.isDefault === true,
      paybillNumber: String(doc.paybillNumber || "").trim() || undefined,
      paybillAccountNumber: String(doc.paybillAccountNumber || "").trim() || undefined,
      tillNumber: String(doc.tillNumber || "").trim() || undefined,
      bank: String(doc.bankBranchRef || "").trim() || undefined,
      bankAccount: String(doc.accountNumber || "").trim() || undefined,
      hasPasskey: hasDarajaPlatformCredentials(),
    }))
    .filter((doc) => Boolean(doc.shortcode));
}

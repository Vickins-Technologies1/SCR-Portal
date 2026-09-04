import "server-only";

import { LandlordMpesa } from "@/models/LandlordMpesa";
import { connectMongoose } from "@/lib/mongoose";
import { decryptPasskey, resolvePlatformStkCredentials } from "@/lib/mpesa";

export type MpesaPaymentType = "paybill" | "till" | "bank";

export type ResolvedMpesaRouting = {
  source: "landlord" | "platform";
  shortcode: string;
  passkey: string;
  paymentType: Exclude<MpesaPaymentType, "bank">;
  paymentAccountId?: string;
  routingKey?: string;
  label?: string;
  propertyIds?: string[];
  isDefault?: boolean;
  paybillNumber?: string;
  paybillAccountNumber?: string;
  tillNumber?: string;
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
  isDefault?: boolean;
  status?: string;
  updatedAt?: string | Date;
  createdAt?: string | Date;
};

function isTruthyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePaymentType(doc?: LandlordMpesaDoc): Exclude<MpesaPaymentType, "bank"> {
  if (doc?.paymentType === "till") return "till";
  if (doc?.paymentType === "paybill") return "paybill";
  if (isTruthyString(doc?.tillNumber)) return "till";
  return "paybill";
}

function resolveShortcodeFromDoc(doc: LandlordMpesaDoc): string {
  const paymentType = normalizePaymentType(doc);
  if (paymentType === "till") {
    return String(doc.tillNumber || doc.shortcode || doc.paybillNumber || "").trim();
  }
  return String(doc.paybillNumber || doc.shortcode || doc.tillNumber || "").trim();
}

function resolvePasskeyFromDoc(doc: LandlordMpesaDoc): string {
  const rawPasskey = String(doc.passkey || "").trim();
  if (!rawPasskey) return "";

  try {
    return decryptPasskey(rawPasskey);
  } catch {
    return rawPasskey;
  }
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
    paymentType: { $in: ["paybill", "till"] },
  })
    .select({
      shortcode: 1,
      passkey: 1,
      paymentType: 1,
      paybillNumber: 1,
      paybillAccountNumber: 1,
      tillNumber: 1,
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
    let platformFallback: ReturnType<typeof resolvePlatformStkCredentials> | null = null;
    try {
      platformFallback = resolvePlatformStkCredentials();
    } catch {
      platformFallback = null;
    }

    const shortcode = resolveShortcodeFromDoc(selectedDoc) || platformFallback?.shortcode || "";
    const passkey = resolvePasskeyFromDoc(selectedDoc) || platformFallback?.passkey || "";

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
      };
    }
  }

  const platform = resolvePlatformStkCredentials();
  return {
    source: "platform",
    shortcode: platform.shortcode,
    passkey: platform.passkey,
    paymentType: platform.source === "kopokopo" ? "till" : "paybill",
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
      passkey: 1,
      paymentType: 1,
      paybillNumber: 1,
      paybillAccountNumber: 1,
      tillNumber: 1,
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
      hasPasskey: Boolean(resolvePasskeyFromDoc(doc)),
    }))
    .filter((doc) => Boolean(doc.shortcode));
}

import { ObjectId, Db } from "mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";

export type C2BPayload = {
  TransactionType?: string;
  TransID: string;
  TransTime?: string;
  TransAmount: string | number;
  BusinessShortCode: string | number;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
};

export function normalizeC2BShortcode(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeC2BReference(payload: C2BPayload) {
  return String(payload.BillRefNumber || payload.InvoiceNumber || "").trim();
}

export async function findLandlordC2BConnection(shortcode: string) {
  await connectMongoose();
  const doc = await LandlordMpesa.findOne({
    $or: [{ shortcode }, { paybillNumber: shortcode }, { tillNumber: shortcode }],
    paymentType: { $in: ["paybill", "till"] },
  })
    .select({ landlord: 1, paymentType: 1, shortcode: 1, paybillNumber: 1, paybillAccountNumber: 1, tillNumber: 1 })
    .lean<{
      landlord?: ObjectId;
      paymentType?: "paybill" | "till";
      shortcode?: string;
      paybillNumber?: string;
      paybillAccountNumber?: string;
      tillNumber?: string;
    }>()
    .exec();

  if (!doc?.landlord) return null;
  return {
    landlordId: doc.landlord.toString(),
    accountType: doc.paymentType === "till" ? "TILL" : "PAYBILL",
    shortcode,
    accountReference: doc.paymentType === "paybill" ? doc.paybillAccountNumber?.trim() || null : null,
  };
}

export async function findC2BInvoice(db: Db, landlordId: string, reference: string) {
  if (!ObjectId.isValid(landlordId) || !reference) return null;
  return db.collection("invoices").findOne({
    userId: landlordId,
    reference,
    status: { $nin: ["completed", "failed"] },
  });
}

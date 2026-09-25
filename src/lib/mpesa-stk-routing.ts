import "server-only";

import type { MpesaStkTransactionType } from "@/lib/mpesa";

export type MpesaStkAccountType = "bank" | "paybill" | "till";

export type MpesaStkAccountConfig = {
  accountType: MpesaStkAccountType;
  bank?: string;
  bankAccount?: string;
  paybillNumber?: string;
  buyGoodsNumber?: string;
};

export type MpesaStkRequestFields = {
  transactionType: MpesaStkTransactionType;
  partyB: string;
  accountReference: string;
};

function requireField(value: string | undefined, label: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Missing ${label} for M-Pesa STK routing`);
  }
  return normalized;
}

export function buildMpesaStkRequestFields(
  config: MpesaStkAccountConfig,
  reference: string
): MpesaStkRequestFields {
  const normalizedReference = String(reference || "").trim();

  switch (config.accountType) {
    case "bank":
      return {
        transactionType: "CustomerPayBillOnline",
        partyB: requireField(config.bank, "bank identifier"),
        accountReference: requireField(config.bankAccount, "bank account number"),
      };
    case "paybill":
      return {
        transactionType: "CustomerPayBillOnline",
        partyB: requireField(config.paybillNumber, "paybill number"),
        accountReference: requireField(normalizedReference, "payment reference"),
      };
    case "till":
      return {
        transactionType: "CustomerBuyGoodsOnline",
        partyB: requireField(config.buyGoodsNumber, "till number"),
        accountReference: requireField(normalizedReference, "payment reference"),
      };
    default: {
      const exhaustive: never = config.accountType;
      throw new Error(`Unsupported M-Pesa account type: ${exhaustive}`);
    }
  }
}

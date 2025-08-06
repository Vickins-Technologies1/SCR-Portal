// src/lib/ums-pay.ts
import { connectToDatabase } from "./mongodb";
import { ObjectId } from "mongodb";

export async function initiateUMSPaySTKPush({
  ownerId,
  amount,
  msisdn,
  reference,
}: {
  ownerId: string;
  amount: number;
  msisdn: string;
  reference: string;
}) {
  try {
    const { db } = await connectToDatabase();
    const owner = await db.collection("owners").findOne({ _id: new ObjectId(ownerId) });
    if (!owner || !owner.paymentSettings?.umsPayEnabled) {
      throw new Error("UMS Pay not enabled for this owner");
    }

    const { umsPayApiKey, umsPayEmail, umsPayAccountId } = owner.paymentSettings;

    const response = await fetch("https://api.umspay.co.ke/api/v1/initiatestkpush", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: umsPayApiKey,
        email: umsPayEmail,
        amount,
        msisdn,
        reference,
        account_id: umsPayAccountId,
      }),
    });

    const data = await response.json();
    if (data.success === "200") {
      return { success: true, transactionRequestId: data.transaction_request_id };
    } else {
      throw new Error(data.errorMessage || "Failed to initiate STK Push");
    }
  } catch (error) {
    console.error("Error initiating UMS Pay STK Push:", error);
    throw new Error("Failed to initiate payment");
  }
}
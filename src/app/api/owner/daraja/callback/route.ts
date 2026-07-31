import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Db, ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";

const CallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            })
          ),
        })
        .optional(),
    }),
  }),
});

function parseMpesaDate(value?: string | number): Date {
  if (!value) return new Date();
  const str = String(value);
  if (!/^\d{14}$/.test(str)) return new Date();
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const day = str.slice(6, 8);
  const hour = str.slice(8, 10);
  const minute = str.slice(10, 12);
  const second = str.slice(12, 14);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`);
}

function extractMetadata(items?: { Name: string; Value?: string | number }[]) {
  const map = new Map<string, string | number>();
  items?.forEach((item) => {
    if (item?.Name) map.set(item.Name, item.Value ?? "");
  });
  return {
    amount: Number(map.get("Amount") || 0),
    receipt: String(map.get("MpesaReceiptNumber") || ""),
    transactionDate: map.get("TransactionDate"),
    phone: String(map.get("PhoneNumber") || ""),
  };
}

async function updatePaymentStatus(db: Db, callback: {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: { Item: { Name: string; Value?: string | number }[] };
}) {
  const metadata = extractMetadata(callback.CallbackMetadata?.Item);
  const status =
    callback.ResultCode === 0
      ? "completed"
      : /cancel/i.test(callback.ResultDesc) || callback.ResultCode === 1032
        ? "cancelled"
        : "failed";

  const result = await db.collection("payments").findOneAndUpdate(
    {
      $or: [
        { checkoutRequestId: callback.CheckoutRequestID },
        { transactionId: callback.CheckoutRequestID },
        { merchantRequestId: callback.MerchantRequestID },
      ],
    },
    {
      $set: {
        status,
        ...(metadata.amount ? { amount: metadata.amount } : {}),
        mpesaCode: metadata.receipt || null,
        paymentDate: parseMpesaDate(metadata.transactionDate).toISOString(),
        phoneNumber: metadata.phone || undefined,
      },
    },
    { returnDocument: "after" }
  );

  return { metadata, payment: result?.value || null, status };
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CallbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const { payment } = await updatePaymentStatus(db, parsed.data.Body.stkCallback);

    if (!payment) {
      logger.warn("Owner Daraja callback received but payment not found", {
        checkoutRequestId: parsed.data.Body.stkCallback.CheckoutRequestID,
      });
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  } catch (error) {
    logger.error("Owner Daraja callback processing error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  }
}


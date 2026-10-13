import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { normalizeC2BReference, normalizeC2BShortcode } from "@/lib/c2b";

const ConfirmationSchema = z.object({
  TransID: z.string().trim().min(1),
  TransAmount: z.union([z.string(), z.number()]),
  BusinessShortCode: z.union([z.string(), z.number()]),
  BillRefNumber: z.string().optional(),
  InvoiceNumber: z.string().optional(),
  MSISDN: z.string().optional(),
  TransTime: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = ConfirmationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
    const payload = parsed.data;
    const shortcode = normalizeC2BShortcode(payload.BusinessShortCode);
    const { db } = await connectToDatabase();
    const amount = Number(payload.TransAmount);
    const reference = normalizeC2BReference(payload);

    // The integration has no verified cryptographic callback credential or
    // provider-status lookup for C2B events. Correlation fields alone are
    // attacker-controlled, so retain these for reconciliation without posting
    // money or marking invoices paid.
    await db.collection("unmatchedMpesaCallbacks").updateOne(
      { provider: "daraja_c2b", transactionId: payload.TransID },
      { $setOnInsert: {
        provider: "daraja_c2b",
        transactionId: payload.TransID,
        shortcode,
        reference,
        amount: Number.isFinite(amount) ? amount : null,
        receivedAt: new Date().toISOString(),
        resolved: false,
        reason: "callback_authenticity_unverified",
      } },
      { upsert: true },
    );
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Confirmation unavailable" }, { status: 500 });
  }
}

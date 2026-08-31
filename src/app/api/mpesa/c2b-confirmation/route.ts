import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { findC2BInvoice, findLandlordC2BConnection, normalizeC2BReference, normalizeC2BShortcode, type C2BPayload } from "@/lib/c2b";

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
    const payload = parsed.data as C2BPayload;
    const shortcode = normalizeC2BShortcode(payload.BusinessShortCode);
    const connection = await findLandlordC2BConnection(shortcode);
    const { db } = await connectToDatabase();
    const amount = Number(payload.TransAmount);
    const reference = normalizeC2BReference(payload);

    if (!connection || !Number.isFinite(amount) || amount <= 0 || !reference) {
      await db.collection("unmatchedMpesaCallbacks").updateOne(
        { provider: "daraja_c2b", transactionId: payload.TransID },
        { $setOnInsert: { provider: "daraja_c2b", transactionId: payload.TransID, shortcode, reference, payload, receivedAt: new Date().toISOString(), resolved: false } },
        { upsert: true },
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
    }

    const invoice = await findC2BInvoice(db, connection.landlordId, reference);
    if (!invoice) {
      await db.collection("unmatchedMpesaCallbacks").updateOne(
        { provider: "daraja_c2b", transactionId: payload.TransID },
        { $setOnInsert: { provider: "daraja_c2b", transactionId: payload.TransID, landlordId: connection.landlordId, shortcode, reference, payload, receivedAt: new Date().toISOString(), resolved: false } },
        { upsert: true },
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
    }

    const tenant = invoice.unitType
      ? await db.collection("tenants").findOne({ ownerId: connection.landlordId, propertyId: invoice.propertyId, unitType: invoice.unitType }, { projection: { _id: 1 } })
      : null;
    const now = new Date().toISOString();
    await db.collection("payments").updateOne(
      { provider: "daraja", transactionId: payload.TransID },
      { $setOnInsert: {
        paymentId: new ObjectId().toString(), tenantId: tenant?._id?.toString() || null, landlordId: connection.landlordId,
        propertyId: invoice.propertyId, invoiceId: invoice._id.toString(), amount, phoneNumber: payload.MSISDN || "",
        transactionId: payload.TransID, mpesaCode: payload.TransID, status: "completed", paymentDate: now, paidAt: now,
        createdAt: now, updatedAt: now, provider: "daraja", paymentMethod: "c2b", mpesaAccountType: connection.accountType,
        mpesaShortcode: shortcode, mpesaAccountReference: connection.accountReference, reference,
      } },
      { upsert: true },
    );
    await db.collection("invoices").updateOne({ _id: invoice._id }, { $set: { status: "completed", updatedAt: now } });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Confirmation unavailable" }, { status: 500 });
  }
}

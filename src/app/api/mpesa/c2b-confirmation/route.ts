import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { findC2BInvoice, findLandlordC2BConnection, normalizeC2BReference, normalizeC2BShortcode, type C2BPayload } from "@/lib/c2b";
import { qualifyReferralFromFirstPaidInvoice } from "@/lib/referrals";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";

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

    const tenantCandidates = invoice.tenantId && ObjectId.isValid(String(invoice.tenantId))
      ? await db.collection("tenants").find({
          _id: new ObjectId(String(invoice.tenantId)),
          ownerId: connection.landlordId,
          propertyId: invoice.propertyId,
        }, { projection: { _id: 1 } }).toArray()
      : await db.collection("tenants").find({
          ownerId: connection.landlordId,
          propertyId: invoice.propertyId,
          ...(invoice.unitType ? { unitType: invoice.unitType } : {}),
        }, { projection: { _id: 1 } }).limit(2).toArray();
    if (tenantCandidates.length !== 1) {
      await db.collection("unmatchedMpesaCallbacks").updateOne(
        { provider: "daraja_c2b", transactionId: payload.TransID },
        { $setOnInsert: { provider: "daraja_c2b", transactionId: payload.TransID, landlordId: connection.landlordId, shortcode, reference, payload, receivedAt: new Date().toISOString(), resolved: false, reason: "ambiguous_tenant" } },
        { upsert: true },
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
    }
    const tenant = tenantCandidates[0];
    const now = new Date().toISOString();
    await db.collection("payments").updateOne(
      { provider: "daraja", transactionId: payload.TransID },
      { $setOnInsert: {
        paymentId: new ObjectId().toString(), tenantId: tenant._id.toString(), landlordId: connection.landlordId,
        propertyId: invoice.propertyId, invoiceId: invoice._id.toString(), amount, phoneNumber: payload.MSISDN || "",
        transactionId: payload.TransID, mpesaCode: payload.TransID, status: "completed", paymentDate: now, paidAt: now,
        createdAt: now, updatedAt: now, provider: "daraja", paymentMethod: "c2b", mpesaAccountType: connection.accountType,
        requestedAmount: Number(invoice.amount || amount), providerConfirmedAmount: amount, postedAmount: null,
        financialPostingStatus: "pending",
        mpesaShortcode: shortcode, mpesaAccountReference: connection.accountReference, reference,
      } },
      { upsert: true },
    );
    const payment = await db.collection("payments").findOne({ provider: "daraja", transactionId: payload.TransID });
    if (payment) {
      await postVerifiedPayment({
        db,
        paymentId: payment._id,
        providerConfirmedAmount: amount,
        providerTransactionId: payload.TransID,
        providerReceipt: payload.TransID,
        allowRequestedAmountMismatch: true,
      });
    }
    await qualifyReferralFromFirstPaidInvoice({ db, invoiceId: invoice._id.toString(), eventId: payload.TransID }).catch(() => undefined);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Confirmation unavailable" }, { status: 500 });
  }
}

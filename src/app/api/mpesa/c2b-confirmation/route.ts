import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { findC2BInvoice, findLandlordC2BConnection, normalizeC2BReference, normalizeC2BShortcode, type C2BPayload } from "@/lib/c2b";
import { qualifyReferralFromFirstPaidInvoice } from "@/lib/referrals";
import { postVerifiedPayment } from "@/lib/verified-payment-posting";
import { calculateInvoiceTotals } from "@/lib/invoice-calculations";
import { getInvoicePostedAmount } from "@/lib/financial-reporting";

const ConfirmationSchema = z.object({
  TransID: z.string().trim().min(1),
  TransAmount: z.union([z.string(), z.number()]),
  BusinessShortCode: z.union([z.string(), z.number()]),
  BillRefNumber: z.string().optional(),
  InvoiceNumber: z.string().optional(),
  MSISDN: z.string().optional(),
  TransTime: z.string().optional(),
});

function parseC2BTransactionDate(value?: string) {
  if (!value || !/^\d{14}$/.test(value)) return new Date().toISOString();
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month, day, hour - 3, minute, second));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

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

    const ownerIdentity = ObjectId.isValid(connection.landlordId)
      ? { $in: [connection.landlordId, new ObjectId(connection.landlordId)] }
      : connection.landlordId;
    const tenantCandidates = invoice.tenantId && ObjectId.isValid(String(invoice.tenantId))
      ? await db.collection("tenants").find({
          _id: new ObjectId(String(invoice.tenantId)),
          ownerId: ownerIdentity,
          propertyId: invoice.propertyId,
        }, { projection: { _id: 1 } }).toArray()
      : await db.collection("tenants").find({
          ownerId: ownerIdentity,
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

    // C2B is allowed to settle an invoice in multiple receipts, but a
    // receipt that exceeds the remaining invoice balance must be held for
    // review rather than silently overpaying or marking the invoice paid.
    const amountPaid = await getInvoicePostedAmount(db, invoice._id.toString());
    const invoiceTotals = calculateInvoiceTotals({
      amount: Number(invoice.amount || 0),
      items: invoice.items,
      discount: invoice.discount,
      tax: invoice.tax,
      amountPaid,
      dueDate: invoice.dueDate || invoice.expiresAt,
    });
    if (invoiceTotals.total <= 0 || amount > invoiceTotals.balanceDue + 0.005) {
      await db.collection("unmatchedMpesaCallbacks").updateOne(
        { provider: "daraja_c2b", transactionId: payload.TransID },
        { $setOnInsert: { provider: "daraja_c2b", transactionId: payload.TransID, landlordId: connection.landlordId, shortcode, reference, payload, receivedAt: new Date().toISOString(), resolved: false, reason: "amount_exceeds_invoice_balance" } },
        { upsert: true },
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
    }

    const tenant = tenantCandidates[0];
    const now = parseC2BTransactionDate(payload.TransTime);
    try {
      await db.collection("payments").updateOne(
        { provider: "daraja", transactionId: payload.TransID },
        { $setOnInsert: {
          paymentId: new ObjectId().toString(), tenantId: tenant._id.toString(), landlordId: connection.landlordId,
          propertyId: invoice.propertyId, invoiceId: invoice._id.toString(), amount, phoneNumber: payload.MSISDN || "",
          transactionId: payload.TransID, mpesaCode: payload.TransID, status: "completed", paymentDate: now, paidAt: now,
          createdAt: now, updatedAt: now, provider: "daraja", paymentMethod: "c2b", mpesaAccountType: connection.accountType,
          requestedAmount: amount, providerConfirmedAmount: amount, postedAmount: null,
          providerTransactionId: payload.TransID,
          financialPostingStatus: "pending",
          mpesaShortcode: shortcode, mpesaAccountReference: connection.accountReference, reference,
        } },
        { upsert: true },
      );
    } catch (error: any) {
      // A concurrent duplicate confirmation may race the upsert. The unique
      // provider identifiers make that safe; continue with the durable row.
      if (error?.code !== 11000) throw error;
    }
    const payment = await db.collection("payments").findOne({ provider: "daraja", transactionId: payload.TransID });
    let financiallyPosted = false;
    if (payment) {
      const posting = await postVerifiedPayment({
        db,
        paymentId: payment._id,
        providerConfirmedAmount: amount,
        providerTransactionId: payload.TransID,
        providerReceipt: payload.TransID,
      });
      if (posting.outcome === "quarantined") {
        return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
      }
      if (posting.outcome === "duplicate" && String(posting.payment?._id) !== String(payment._id)) {
        return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted for reconciliation" });
      }
      financiallyPosted = posting.outcome === "posted"
        || (posting.outcome === "duplicate" && posting.payment?.financialPostingStatus === "posted");
    }
    if (financiallyPosted) {
      await qualifyReferralFromFirstPaidInvoice({ db, invoiceId: invoice._id.toString(), eventId: payload.TransID }).catch(() => undefined);
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Confirmation unavailable" }, { status: 500 });
  }
}

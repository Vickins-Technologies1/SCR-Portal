import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getLifetimePlan, getActiveLifetimeEntitlement } from "@/lib/lifetime";
import { getMpesaCallbackUrl, getMpesaPasskey, getMpesaShortcode, initiateStkPush, normalizePhoneNumber, isValidKenyanMsisdn } from "@/lib/mpesa";
import { createIncomingPayment, getKopokopoTillNumber } from "@/lib/kopokopo";

const CheckoutSchema = z.object({ phone: z.string().trim().min(7) });

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || !validateCsrfToken(request, csrfToken)) return buildInvalidCsrfResponse(request);

  const role = request.cookies.get("role")?.value;
  const ownerId = request.cookies.get("userId")?.value;
  if (role !== "propertyOwner" || !ownerId || !ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Only property owners can purchase Lifetime." }, { status: 401 });
  }

  const parsed = CheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "A valid phone number is required." }, { status: 400 });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!isValidKenyanMsisdn(phone)) return NextResponse.json({ success: false, message: "Enter a valid Kenyan M-Pesa number." }, { status: 400 });

  try {
    const { db } = await connectToDatabase();
    const plan = await getLifetimePlan(db);
    if (!plan.active) return NextResponse.json({ success: false, message: "Lifetime is not currently available." }, { status: 409 });
    if (!Number.isSafeInteger(plan.price) || plan.price <= 0) {
      return NextResponse.json({ success: false, message: "Lifetime pricing has not been configured yet." }, { status: 503 });
    }
    if (await getActiveLifetimeEntitlement(db, ownerId)) {
      return NextResponse.json({ success: false, message: "Your Lifetime entitlement is already active." }, { status: 409 });
    }

    const pending = await db.collection("payments").findOne({ ownerId, planType: "lifetime", billingType: "one_time", status: { $in: ["pending", "processing"] } });
    if (pending) {
      return NextResponse.json({ success: true, paymentId: pending._id.toString(), checkoutRequestId: pending.checkoutRequestId || pending.transactionId, status: pending.status, plan: "lifetime" });
    }

    const accountReference = `SORANA-LT-${ownerId.slice(-8).toUpperCase()}`;
    const kopokopoConfigured = Boolean(process.env.KOPOKOPO_TILL_NUMBER && process.env.KOPOKOPO_CLIENT_ID && (process.env.KOPOKOPO_CLIENT_SECRET || process.env.KOPOKOPO_PASSKEY));
    let provider: "daraja" | "kopokopo" = "daraja";
    let checkoutRequestId = "";
    let merchantRequestId = "";
    let customerMessage = "Check your phone to complete the one-time payment.";

    if (kopokopoConfigured) {
      const callbackBase = (process.env.KOPOKOPO_CALLBACK_BASE_URL || process.env.MPESA_CALLBACK_BASE_URL || request.nextUrl.origin).replace(/\/$/, "");
      const incoming = await createIncomingPayment({
        tillNumber: getKopokopoTillNumber(),
        phoneNumber: phone,
        amount: plan.price,
        firstName: "Sorana",
        lastName: "Lifetime",
        reference: accountReference,
        notes: "Sorana Lifetime package",
        callbackUrl: `${callbackBase}/api/kopokopo/webhook`,
        customerId: ownerId,
      });
      provider = "kopokopo";
      checkoutRequestId = incoming.id;
      customerMessage = incoming.customerMessage;
    } else {
      const callbackUrl = getMpesaCallbackUrl("/api/mpesa/stk-callback");
      const stk = await initiateStkPush({
        shortcode: getMpesaShortcode(),
        passkey: getMpesaPasskey(),
        amount: plan.price,
        phone,
        accountReference,
        transactionDesc: "Sorana Lifetime package",
        callbackUrl,
        transactionType: "CustomerPayBillOnline",
      });
      if (stk.ResponseCode !== "0") return NextResponse.json({ success: false, message: stk.ResponseDescription || "Payment initiation failed." }, { status: 400 });
      checkoutRequestId = stk.CheckoutRequestID;
      merchantRequestId = stk.MerchantRequestID;
      customerMessage = stk.CustomerMessage || customerMessage;
    }

    const now = new Date();
    const result = await db.collection("payments").insertOne({
      ownerId,
      userId: ownerId,
      planId: "lifetime",
      planType: "lifetime",
      billingType: "one_time",
      amount: plan.price,
      currency: plan.currency,
      paymentProvider: provider,
      provider,
      providerTransactionId: checkoutRequestId,
      providerReference: null,
      transactionId: checkoutRequestId,
      checkoutRequestId,
      merchantRequestId,
      reference: accountReference,
      phoneNumber: phone,
      status: "pending",
      verificationStatus: "pending",
      initiatedAt: now,
      createdAt: now,
      updatedAt: now,
      metadata: { product: "lifetime", subscriptionPeriod: "lifetime", recurring: false, autoRenew: false },
    });

    return NextResponse.json({ success: true, paymentId: result.insertedId.toString(), checkoutRequestId, message: customerMessage, plan: "lifetime" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to start Lifetime checkout." }, { status: 500 });
  }
}

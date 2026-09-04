import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getMpesaCallbackUrl, initiateStkPush, isValidKenyanMsisdn, normalizePhoneNumber } from "@/lib/mpesa";
import { resolveOwnerDarajaStkConfig } from "@/lib/owner-daraja";

const StkSchema = z.object({
  mode: z.enum(["shared_daraja", "user_paybill"]),
  amount: z.preprocess((value) => Number(value), z.number().positive()),
  phone: z.string().trim().min(7),
  accountReference: z.string().trim().min(1),
  transactionDesc: z.string().trim().min(1),
  tenantId: z.string().trim().optional(),
});

type OwnerContext = {
  ownerId: string;
  canEdit: boolean;
};

async function resolveOwnerContext(request: NextRequest): Promise<OwnerContext | null> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["propertyOwner", "teamMember"].includes(role)) {
    return null;
  }

  if (role === "propertyOwner") {
    return { ownerId: userId, canEdit: true };
  }

  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), active: true });
  if (!member?.ownerId) return null;

  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const canEdit = permissions.includes("integrations:edit") || permissions.includes("settings:edit");

  return { ownerId: member.ownerId.toString(), canEdit };
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  const context = await resolveOwnerContext(request);
  if (!context) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!context.canEdit) {
    return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = StkSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
  if (!isValidKenyanMsisdn(normalizedPhone)) {
    return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const resolved = await resolveOwnerDarajaStkConfig(db, context.ownerId, parsed.data.mode);
    let callbackUrl: string;
    try { callbackUrl = getMpesaCallbackUrl(); } catch { return NextResponse.json({ success: false, message: "Invalid Daraja callback configuration." }, { status: 500 }); }

    const stkResponse = await initiateStkPush({
      shortcode: resolved.shortcode,
      passkey: resolved.passkey,
      amount: parsed.data.amount,
      phone: normalizedPhone,
      accountReference: parsed.data.accountReference || resolved.accountReference || normalizedPhone,
      transactionDesc: parsed.data.transactionDesc,
      callbackUrl,
      transactionType: resolved.paymentType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
      consumerKey: resolved.consumerKey,
      consumerSecret: resolved.consumerSecret,
      environment: resolved.environment,
    });

    if (stkResponse.ResponseCode !== "0") {
      return NextResponse.json(
        { success: false, message: stkResponse.ResponseDescription || "Payment initiation failed" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    await db.collection("payments").insertOne({
      ownerId: context.ownerId,
      tenantId: parsed.data.tenantId || null,
      amount: parsed.data.amount,
      paymentDate: nowIso,
      transactionId: stkResponse.CheckoutRequestID,
      status: "pending",
      createdAt: nowIso,
      phoneNumber: normalizedPhone,
      reference: parsed.data.accountReference,
      mpesaCode: null,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      provider: "daraja",
      paymentMethod: "daraja_stk",
      mpesaMode: parsed.data.mode,
      integrationMode: parsed.data.mode,
    });

    return NextResponse.json({
      success: true,
      message: stkResponse.CustomerMessage || "STK Push initiated. Check your phone.",
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      mode: parsed.data.mode,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to initiate STK push",
      },
      { status: 500 }
    );
  }
}

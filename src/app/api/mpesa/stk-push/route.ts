// src/app/api/mpesa/stk-push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { createTumaStkPush, isTumaConfigured } from "@/lib/tuma";
import { getOwnerTumaIntegration } from "@/lib/owner-integrations";
import { createIncomingPayment, getKopokopoTillNumber } from "@/lib/kopokopo";
import {
  decryptPasskey,
  getKopokopoPasskey,
  getMpesaPasskey,
  getMpesaShortcode,
  initiateStkPush,
  isValidKenyanMsisdn,
  normalizePhoneNumber,
  getMpesaCallbackUrl,
} from "@/lib/mpesa";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { resolveTenantContext } from "@/lib/impersonation";
import logger from "@/lib/logger";
import { resolveAccountTier } from "@/lib/tier";
import { randomUUID } from "node:crypto";

const StkPushSchema = z.object({
  amount: z.preprocess((v) => Number(v), z.number().int().positive()),
  phone: z.string().trim(),
  invoiceId: z.string().trim().optional().default(""),
  landlordId: z.string().trim().optional().default(""),
  type: z.enum(["Rent", "Utility", "Deposit", "Other"]).optional(),
});

type RateLimitState = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateLimitState>();

function safeGetMpesaShortcode(): string {
  try {
    return getMpesaShortcode();
  } catch {
    return "";
  }
}

function safeGetMpesaPasskey(): string {
  try {
    return getMpesaPasskey();
  } catch {
    return "";
  }
}

function safeGetKopokopoTillNumber(): string {
  try {
    return getKopokopoTillNumber();
  } catch {
    return "";
  }
}

function safeGetKopokopoPasskey(): string {
  try {
    return getKopokopoPasskey();
  } catch {
    return "";
  }
}

function resolveStoredPasskey(rawPasskey: string): string {
  if (!rawPasskey) return "";
  try {
    return decryptPasskey(rawPasskey);
  } catch {
    // Stored as plain text or missing encryption secret; fallback to raw value.
    return rawPasskey;
  }
}

function rateLimit(key: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const existing = rateLimitMap.get(key);
  if (!existing || existing.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count };
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // CSRF protection for payment initiation
  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateKey = `${userId}:${ip}`;
  const limiter = rateLimit(rateKey);
  if (!limiter.allowed) {
    return NextResponse.json({ success: false, message: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = StkPushSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
    let payerPhone = normalizedPhone;
    let paymentAmount = parsed.data.amount;
    let invoiceReference = parsed.data.invoiceId
      ? (parsed.data.invoiceId.startsWith("INV-") ? parsed.data.invoiceId : `INV-${parsed.data.invoiceId}`)
      : "";

    let propertyId: string | null = null;
    let tenantId: string | null = null;
    let derivedLandlordId: string | null = null;
    let isPlatformInvoicePayment = false;

    // Resolve tenant + landlord context
    if (role === "tenant" || (role === "propertyOwner" && isImpersonating)) {
      let targetTenantId = userId;
      if (role === "propertyOwner") {
        const tenantContext = await resolveTenantContext({
          db,
          userId,
          role,
          isImpersonating,
          impersonatingTenantId,
        });

        if (!tenantContext) {
          return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
        }

        targetTenantId = tenantContext.tenantId;
      }

      const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(targetTenantId) });
      if (!tenant) {
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }
      tenantId = tenant._id.toString();
      propertyId = tenant.propertyId;
      derivedLandlordId =
        typeof tenant.ownerId === "string"
          ? tenant.ownerId
          : tenant.ownerId?.toString?.() || null;
      invoiceReference = `TENANT-${tenantId}-${randomUUID().slice(0, 8)}`;
    }

    // Owner-initiated STK (e.g., platform invoices)
    if (role === "propertyOwner" && !isImpersonating) {
      if (!ObjectId.isValid(parsed.data.invoiceId)) {
        return NextResponse.json({ success: false, message: "Invalid invoice ID" }, { status: 400 });
      }
      const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(parsed.data.invoiceId) });
      if (!invoice) {
        return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
      }
      if (invoice.userId?.toString?.() !== userId) {
        return NextResponse.json({ success: false, message: "Unauthorized invoice access" }, { status: 403 });
      }
      const ownerProfile = await db.collection("propertyOwners").findOne(
        { _id: new ObjectId(userId), role: "propertyOwner" },
        { projection: { phone: 1 } }
      );
      const ownerPhone = typeof ownerProfile?.phone === "string" ? ownerProfile.phone.trim() : "";
      if (!ownerPhone) {
        return NextResponse.json(
          { success: false, message: "Missing phone number on your account. Please update your profile before paying this invoice." },
          { status: 400 }
        );
      }
      const normalizedOwnerPhone = normalizePhoneNumber(ownerPhone);
      if (!isValidKenyanMsisdn(normalizedOwnerPhone)) {
        return NextResponse.json(
          { success: false, message: "Invalid phone number format on your account. Please update your profile before paying this invoice." },
          { status: 400 }
        );
      }
      const trustedInvoiceAmount = Number(invoice.amount || 0);
      if (!Number.isFinite(trustedInvoiceAmount) || trustedInvoiceAmount <= 0) {
        return NextResponse.json(
          { success: false, message: "Invoice amount is invalid. Please regenerate the invoice." },
          { status: 400 }
        );
      }

      paymentAmount = trustedInvoiceAmount;
      payerPhone = normalizedOwnerPhone;
      invoiceReference =
        typeof invoice.reference === "string" && invoice.reference.trim()
          ? invoice.reference.trim()
          : `INV-${invoice._id.toString()}`;
      propertyId = invoice.propertyId || null;
      derivedLandlordId = userId;
      isPlatformInvoicePayment = true;
    }

    if (!isPlatformInvoicePayment && !isValidKenyanMsisdn(payerPhone)) {
      return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
    }

    if (!derivedLandlordId || (parsed.data.landlordId && derivedLandlordId !== parsed.data.landlordId)) {
      return NextResponse.json({ success: false, message: "Invalid landlord reference" }, { status: 403 });
    }

    if (isPlatformInvoicePayment) {
      const existingInvoicePayment = await db.collection("payments").findOne(
        {
          invoiceId: parsed.data.invoiceId,
          landlordId: parsed.data.landlordId,
          status: { $in: ["pending", "pending_stk", "completed"] },
        },
        { sort: { createdAt: -1, _id: -1 } }
      );

      if (existingInvoicePayment) {
        const existingStatus = String(existingInvoicePayment.status || "").toLowerCase();
        if (existingStatus === "completed") {
          return NextResponse.json(
            {
              success: false,
              message: "This invoice has already been paid.",
              status: "completed",
            },
            { status: 409 }
          );
        }

        const existingCheckoutRequestId =
          existingInvoicePayment.checkoutRequestId || existingInvoicePayment.transactionId || "";
        return NextResponse.json(
          {
            success: true,
            message: "A payment request is already pending for this invoice.",
            checkoutRequestId: existingCheckoutRequestId,
            merchantRequestId: existingInvoicePayment.merchantRequestId || "",
            customerMessage: "A payment request is already pending for this invoice.",
            shortcode: safeGetKopokopoTillNumber(),
          },
          { status: 200 }
        );
      }
    }

    // Free tier: tenants cannot initiate payments (view-only).
    if (role === "tenant" || (role === "propertyOwner" && isImpersonating)) {
      const ownerTier = resolveAccountTier(
        (
          await db.collection("propertyOwners").findOne(
            { _id: new ObjectId(derivedLandlordId), role: "propertyOwner" },
            { projection: { tier: 1 } }
          )
        )?.tier,
        "premium"
      );
      if (ownerTier === "free") {
        return NextResponse.json(
          {
            success: false,
            message: "Payments are locked on the Free tier. Ask the property owner to upgrade to Premium to enable tenant payments.",
            code: "FREE_TIER_TENANT_PAYMENTS_LOCKED",
          },
          { status: 403 }
        );
      }
    }

    let paymentType: "paybill" | "till" | "bank" | "unknown" = "unknown";
    let paybillNumber = "";
    let paybillAccountNumber = "";
    let tillNumber = "";
    let storedShortcode = "";
    let storedPasskey = "";

    if (isPlatformInvoicePayment) {
      tillNumber = safeGetKopokopoTillNumber();
      if (!tillNumber) {
        return NextResponse.json(
          { success: false, message: "Missing KOPOKOPO_TILL_NUMBER for invoice payments." },
          { status: 500 }
        );
      }

      const ownerProfile = await db.collection("propertyOwners").findOne(
        { _id: new ObjectId(userId), role: "propertyOwner" },
        { projection: { name: 1, email: 1, phone: 1 } }
      );
      const ownerName = typeof ownerProfile?.name === "string" ? ownerProfile.name.trim() : "";
      const ownerEmail = typeof ownerProfile?.email === "string" ? ownerProfile.email.trim() : "";
      const ownerPhone = typeof ownerProfile?.phone === "string" ? ownerProfile.phone.trim() : "";
      const nameParts = ownerName.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Owner";
      const appBaseUrl = (
        process.env.KOPOKOPO_CALLBACK_BASE_URL ||
        process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        request.nextUrl.origin
      )
        .trim()
        .replace(/\/$/, "");
      if (!appBaseUrl) {
        return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
      }

      const nowIso = new Date().toISOString();
      await db.collection("payments").findOneAndUpdate(
        {
          invoiceId: parsed.data.invoiceId,
          landlordId: parsed.data.landlordId,
          status: { $in: ["pending", "pending_stk"] },
        },
        {
          $set: {
            tenantId,
            amount: paymentAmount,
            propertyId,
            paymentDate: nowIso,
            status: "pending_stk",
            type: parsed.data.type || "Rent",
            phoneNumber: payerPhone,
            reference: invoiceReference,
            mpesaCode: null,
            invoiceId: parsed.data.invoiceId,
            landlordId: parsed.data.landlordId,
            provider: "kopokopo",
            kopokopoTillNumber: tillNumber,
          },
          $setOnInsert: {
            createdAt: nowIso,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      let incomingPayment: Awaited<ReturnType<typeof createIncomingPayment>>;
      try {
        incomingPayment = await createIncomingPayment({
          tillNumber,
          phoneNumber: payerPhone,
          amount: paymentAmount,
          firstName,
          lastName,
          email: ownerEmail || ownerPhone || "",
          reference: invoiceReference,
          notes: `${parsed.data.type || "Invoice"} payment ${invoiceReference}`,
          callbackUrl: `${appBaseUrl}/api/kopokopo/webhook`,
          customerId: parsed.data.invoiceId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("KopoKopo invoice payment initiation failed", {
          message,
          userId,
          invoiceId: parsed.data.invoiceId,
        });
        if (/invalid_client/i.test(message) || /access token/i.test(message)) {
          return NextResponse.json(
            {
              success: false,
              message:
                "KopoKopo authentication failed. Check KOPOKOPO_OAUTH_BASE_URL, KOPOKOPO_CLIENT_ID, KOPOKOPO_CLIENT_SECRET, and KOPOKOPO_TILL_NUMBER.",
            },
            { status: 502 }
          );
        }
        throw error;
      }

      await db.collection("payments").findOneAndUpdate(
        {
          invoiceId: parsed.data.invoiceId,
          landlordId: parsed.data.landlordId,
          status: { $in: ["pending", "pending_stk"] },
        },
        {
          $set: {
            tenantId,
            amount: paymentAmount,
            propertyId,
            paymentDate: nowIso,
            transactionId: incomingPayment.id,
            status: "pending",
            updatedAt: nowIso,
            type: parsed.data.type || "Rent",
            phoneNumber: payerPhone,
            reference: invoiceReference,
            mpesaCode: null,
            checkoutRequestId: incomingPayment.id,
            merchantRequestId: "",
            invoiceId: parsed.data.invoiceId,
            landlordId: parsed.data.landlordId,
            provider: "kopokopo",
            kopokopoPaymentRequestId: incomingPayment.id,
            kopokopoPaymentRequestUrl: incomingPayment.location,
            kopokopoTillNumber: tillNumber,
          },
          $setOnInsert: {
            createdAt: nowIso,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      return NextResponse.json(
        {
          success: true,
          message: incomingPayment.customerMessage || "STK Push initiated. Check your phone.",
          checkoutRequestId: incomingPayment.id,
          merchantRequestId: "",
          customerMessage: incomingPayment.customerMessage || "STK Push initiated. Check your phone.",
          shortcode: tillNumber,
          provider: "kopokopo",
        },
        { status: 200 }
      );
    } else {
      try {
        await connectMongoose();
        const doc = await LandlordMpesa.findOne({ landlord: derivedLandlordId })
          .select({ paymentType: 1, paybillNumber: 1, paybillAccountNumber: 1, tillNumber: 1, shortcode: 1, passkey: 1 })
          .lean<{
            paymentType?: string;
            paybillNumber?: string;
            paybillAccountNumber?: string;
            tillNumber?: string;
            shortcode?: string;
            passkey?: string;
          }>()
          .exec();

        paybillNumber = doc?.paybillNumber?.trim() || "";
        paybillAccountNumber = doc?.paybillAccountNumber?.trim() || "";
        tillNumber = doc?.tillNumber?.trim() || "";
        storedShortcode = doc?.shortcode?.trim() || "";
        storedPasskey = doc?.passkey?.trim() || "";

        if (doc?.paymentType === "till" || doc?.paymentType === "paybill" || doc?.paymentType === "bank") {
          paymentType = doc.paymentType;
        } else if (tillNumber) {
          paymentType = "till";
        } else if (paybillNumber) {
          paymentType = "paybill";
        }
      } catch {
        // Ignore lookup errors and fall back to env defaults below.
      }
    }

    const connectedShortcode =
      paymentType === "till" ? tillNumber : paymentType === "paybill" ? paybillNumber : "";
    const preferredShortcode = connectedShortcode || storedShortcode;
    const stkAccountReference =
      paymentType === "paybill" && paybillAccountNumber ? paybillAccountNumber : invoiceReference;
    const transactionType = paymentType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

    const tumaCallbackBase = (process.env.TUMA_CALLBACK_BASE_URL || "").trim().replace(/\/$/, "");
    const tumaIntegration = await getOwnerTumaIntegration(db, derivedLandlordId);
    const tumaConfigured = isTumaConfigured(
      tumaIntegration
        ? { email: tumaIntegration.email, apiKey: tumaIntegration.apiKey }
        : null
    );
    if (tumaConfigured && !tumaCallbackBase) {
      return NextResponse.json(
        { success: false, message: "Missing TUMA_CALLBACK_BASE_URL for Tuma gateway." },
        { status: 500 }
      );
    }

    if (tumaConfigured && !isPlatformInvoicePayment) {
      const description = `${parsed.data.type || "Rent"} payment ${invoiceReference}`;
      const incoming = await createTumaStkPush({
        amount: paymentAmount,
        phone: payerPhone,
        description,
        callbackUrl: `${tumaCallbackBase}/api/tuma/webhook`,
        credentials: {
          email: tumaIntegration!.email,
          apiKey: tumaIntegration!.apiKey,
        },
      });

      const nowIso = new Date().toISOString();
      const checkoutRequestId = incoming.checkoutRequestId || incoming.merchantRequestId || "";
      const merchantRequestId = incoming.merchantRequestId || "";
      await db.collection("payments").insertOne({
        tenantId,
        amount: paymentAmount,
        propertyId,
        paymentDate: nowIso,
        transactionId: checkoutRequestId || merchantRequestId || invoiceReference,
        status: "pending_stk",
        createdAt: nowIso,
        type: parsed.data.type || "Rent",
        phoneNumber: payerPhone,
        reference: invoiceReference,
        mpesaCode: null,
        checkoutRequestId,
        merchantRequestId,
        invoiceId: parsed.data.invoiceId,
        landlordId: parsed.data.landlordId,
        provider: "tuma",
        tumaPaymentId: incoming.raw?.data?.payment_id || incoming.raw?.payment_id || "",
      });

      return NextResponse.json(
        {
          success: true,
          message: incoming.customerMessage || "STK Push initiated — please check your phone and enter M-Pesa PIN.",
          checkoutRequestId,
          merchantRequestId,
          customerMessage:
            incoming.customerMessage || "STK Push initiated — please check your phone and enter M-Pesa PIN.",
          provider: "tuma",
        },
        { status: 200 }
      );
    }

    // Resolve Daraja credentials (provider remains explicit; KopoKopo/Tuma branches exit above).
    let shortcode = preferredShortcode;
    let passkey = resolveStoredPasskey(storedPasskey);
    const envShortcode = safeGetMpesaShortcode();
    const envPasskey = safeGetMpesaPasskey();

    // A C2B-authorized landlord destination is not automatically an STK
    // destination for Sorana's platform Daraja credentials. Do not send an
    // STK request that Safaricom will reject with 4999 Wrong credentials.
    if (connectedShortcode && envShortcode && connectedShortcode !== envShortcode) {
      return NextResponse.json(
        {
          success: false,
          code: "C2B_PAYMENT_REQUIRED",
          message: paymentType === "paybill"
            ? `This landlord account accepts C2B payments. Pay KES ${paymentAmount} to PayBill ${connectedShortcode} using account ${stkAccountReference}.`
            : `This landlord account accepts C2B payments. Pay KES ${paymentAmount} to Till ${connectedShortcode}.`,
          paymentType,
          shortcode: connectedShortcode,
          accountReference: paymentType === "paybill" ? stkAccountReference : null,
        },
        { status: 409 },
      );
    }

    if (!shortcode) {
      shortcode = envShortcode;
    }

    if (!passkey) {
      passkey = envPasskey;
    }

    if (!shortcode || !passkey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing payment credentials. Configure landlord shortcode/passkey or platform KOPOKOPO_TILL_NUMBER/KOPOKOPO_CLIENT_SECRET (or KOPOKOPO_PASSKEY legacy alias) or MPESA_SHORTCODE/MPESA_PASSKEY.",
        },
        { status: 500 }
      );
    }
    let callbackUrl: string;
    try { callbackUrl = getMpesaCallbackUrl(); } catch { return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 }); }

    const activeDarajaPayment = await db.collection("payments").findOne({
      tenantId,
      invoiceId: parsed.data.invoiceId,
      landlordId: parsed.data.landlordId,
      provider: { $in: ["daraja", "mpesa", null] },
      status: { $in: ["pending", "processing", "pending_stk"] },
    }, { sort: { createdAt: -1, _id: -1 } });
    if (activeDarajaPayment) {
      return NextResponse.json({
        success: true,
        message: "A Daraja payment request is already pending for this invoice.",
        checkoutRequestId: activeDarajaPayment.checkoutRequestId || activeDarajaPayment.transactionId || "",
        merchantRequestId: activeDarajaPayment.merchantRequestId || "",
        customerMessage: "A payment request is already pending for this invoice.",
        provider: "daraja",
      }, { status: 200 });
    }

    // Initiate Daraja STK push
    const stkResponse = await initiateStkPush({
      shortcode,
      passkey,
      amount: paymentAmount,
      phone: payerPhone,
      accountReference: stkAccountReference,
      transactionDesc: `${parsed.data.type || "Rent"} Payment`,
      callbackUrl,
      transactionType,
    });

    if (stkResponse.ResponseCode !== "0") {
      return NextResponse.json(
        { success: false, message: stkResponse.ResponseDescription || "Payment initiation failed" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    // Store pending payment for callback reconciliation
    await db.collection("payments").findOneAndUpdate(
      {
        invoiceId: parsed.data.invoiceId,
        landlordId: parsed.data.landlordId,
        status: { $in: ["pending", "pending_stk"] },
      },
      {
        $set: {
          tenantId,
          paymentId: randomUUID(),
          amount: paymentAmount,
          propertyId,
          paymentDate: nowIso,
          transactionId: stkResponse.CheckoutRequestID,
          status: "pending",
          type: parsed.data.type || "Rent",
          phoneNumber: payerPhone,
          reference: invoiceReference,
          mpesaCode: null,
          checkoutRequestId: stkResponse.CheckoutRequestID,
          merchantRequestId: stkResponse.MerchantRequestID,
          invoiceId: parsed.data.invoiceId,
          landlordId: parsed.data.landlordId,
          provider: "daraja",
          paymentMethod: "daraja_stk",
          mpesaAccountType: paymentType === "till" ? "TILL" : "PAYBILL",
          mpesaShortcode: shortcode,
          mpesaAccountReference: paymentType === "paybill" ? stkAccountReference : null,
          transactionDesc: `${parsed.data.type || "Rent"} Payment`,
          shortcode,
          resultCode: null,
          resultDesc: null,
        },
        $setOnInsert: {
          createdAt: nowIso,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return NextResponse.json(
      {
        success: true,
        message: stkResponse.CustomerMessage || "STK Push initiated. Check your phone.",
        checkoutRequestId: stkResponse.CheckoutRequestID,
        merchantRequestId: stkResponse.MerchantRequestID,
        customerMessage: stkResponse.CustomerMessage,
        shortcode,
        provider: "daraja",
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("POST /api/mpesa/stk-push error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json(
      { success: false, message: "Payment initiation failed, try again" },
      { status: 500 }
    );
  }
}

// src/app/api/mpesa/stk-push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { createIncomingPaymentRequest } from "@/lib/kopokopo";
import {
  decryptPasskey,
  getMpesaPasskey,
  getMpesaShortcode,
  initiateStkPush,
  isValidKenyanMsisdn,
  normalizePhoneNumber,
} from "@/lib/mpesa";
import { validateCsrfToken } from "@/lib/csrf";
import { resolveTenantContext } from "@/lib/impersonation";
import logger from "@/lib/logger";

const StkPushSchema = z.object({
  amount: z.preprocess((v) => Number(v), z.number().int().positive()),
  phone: z.string().trim(),
  invoiceId: z.string().trim().min(1),
  landlordId: z.string().trim().min(1),
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

function resolveStoredPasskey(rawPasskey: string): string {
  if (!rawPasskey) return "";
  try {
    return decryptPasskey(rawPasskey);
  } catch {
    // Stored as plain text or missing encryption secret; fallback to raw value.
    return rawPasskey;
  }
}

function splitName(fullName?: string): { firstName: string; lastName: string } {
  const safe = (fullName || "").trim();
  if (!safe) return { firstName: "Customer", lastName: "Payment" };
  const parts = safe.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Payment" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function isKopoKopoOnlinePaymentsTill(value: string): boolean {
  const trimmed = (value || "").trim().toUpperCase();
  return /^K\d{5,}$/.test(trimmed);
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
    return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
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

    if (!isValidKenyanMsisdn(normalizedPhone)) {
      return NextResponse.json({ success: false, message: "Invalid phone number format" }, { status: 400 });
    }

    let propertyId: string | null = null;
    let tenantId: string | null = null;
    let tenantName: string | null = null;
    let tenantEmail: string | null = null;
    let derivedLandlordId: string | null = null;

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
      tenantName = tenant.name || null;
      tenantEmail = tenant.email || null;
      derivedLandlordId =
        typeof tenant.ownerId === "string"
          ? tenant.ownerId
          : tenant.ownerId?.toString?.() || null;
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
      propertyId = invoice.propertyId || null;
      derivedLandlordId = userId;
    }

    if (!derivedLandlordId || derivedLandlordId !== parsed.data.landlordId) {
      return NextResponse.json({ success: false, message: "Invalid landlord reference" }, { status: 403 });
    }

    let paymentType: "paybill" | "till" | "bank" | "unknown" = "unknown";
    let paybillNumber = "";
    let paybillAccountNumber = "";
    let tillNumber = "";
    let storedShortcode = "";
    let storedPasskey = "";

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

    const connectedShortcode =
      paymentType === "till" ? tillNumber : paymentType === "paybill" ? paybillNumber : "";
    const preferredShortcode = connectedShortcode || storedShortcode;
    const invoiceReference = parsed.data.invoiceId.startsWith("INV-")
      ? parsed.data.invoiceId
      : `INV-${parsed.data.invoiceId}`;
    const stkAccountReference =
      paymentType === "paybill" && paybillAccountNumber ? paybillAccountNumber : invoiceReference;
    const transactionType = paymentType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

    const kopoClientId = (process.env.KOPOKOPO_CLIENT_ID || "").trim();
    const kopoClientSecret = (process.env.KOPOKOPO_CLIENT_SECRET || "").trim();
    const kopoCallbackBase = (process.env.KOPOKOPO_CALLBACK_BASE_URL || "").trim();
    const kopoTillEnv = (process.env.KOPOKOPO_STK_TILL_NUMBER || "").trim();
    const useKopoKopo = !!(kopoClientId && kopoClientSecret && kopoCallbackBase);

    const kopoTillFromLandlord = tillNumber;
    const kopoTillCandidate = isKopoKopoOnlinePaymentsTill(kopoTillFromLandlord)
      ? kopoTillFromLandlord
      : isKopoKopoOnlinePaymentsTill(kopoTillEnv)
        ? kopoTillEnv
        : "";

    if (kopoTillCandidate) {
      if (!useKopoKopo) {
        const missing: string[] = [];
        if (!kopoClientId) missing.push("KOPOKOPO_CLIENT_ID");
        if (!kopoClientSecret) missing.push("KOPOKOPO_CLIENT_SECRET");
        if (!kopoCallbackBase) missing.push("KOPOKOPO_CALLBACK_BASE_URL");
        return NextResponse.json(
          {
            success: false,
            message: `Incomplete KopoKopo configuration. Missing: ${missing.join(", ")}.`,
          },
          { status: 500 }
        );
      }

      const { firstName, lastName } = splitName(tenantName || undefined);

      const incoming = await createIncomingPaymentRequest({
        tillNumber: kopoTillCandidate,
        firstName,
        lastName,
        phoneNumber: `+${normalizedPhone}`,
        email: tenantEmail || undefined,
        amount: parsed.data.amount,
        metadata: {
          reference: invoiceReference,
          invoice_id: parsed.data.invoiceId,
          tenant_id: tenantId || "",
          landlord_id: derivedLandlordId,
        },
        callbackUrl: `${kopoCallbackBase}/api/kopokopo/incoming-payments`,
      });

      const nowIso = new Date().toISOString();
      await db.collection("payments").insertOne({
        tenantId,
        amount: parsed.data.amount,
        propertyId,
        paymentDate: nowIso,
        transactionId: incoming.id,
        status: "pending",
        createdAt: nowIso,
        type: parsed.data.type || "Rent",
        phoneNumber: normalizedPhone,
        reference: invoiceReference,
        mpesaCode: null,
        checkoutRequestId: incoming.id,
        merchantRequestId: incoming.id,
        invoiceId: parsed.data.invoiceId,
        landlordId: parsed.data.landlordId,
        provider: "kopokopo",
        kopokopoIncomingPaymentId: incoming.id,
        kopokopoLocation: incoming.location,
      });

      return NextResponse.json(
        {
          success: true,
          message: "STK Push initiated via KopoKopo. Check your phone.",
          checkoutRequestId: incoming.id,
          merchantRequestId: incoming.id,
          customerMessage: "STK Push initiated via KopoKopo.",
          provider: "kopokopo",
        },
        { status: 200 }
      );
    }

    if (useKopoKopo && !kopoTillCandidate) {
      return NextResponse.json(
        {
          success: false,
          message:
            "KopoKopo STK Push requires an Online Payments till that starts with 'K'. Configure a KopoKopo till number for this landlord or set KOPOKOPO_STK_TILL_NUMBER. If you want to use a Safaricom paybill/till instead, configure MPESA_SHORTCODE/MPESA_PASSKEY.",
        },
        { status: 400 }
      );
    }

    // Resolve M-Pesa credentials (prefer landlord-level, fallback to platform)
    let shortcode = preferredShortcode;
    let passkey = resolveStoredPasskey(storedPasskey);
    const envShortcode = safeGetMpesaShortcode();
    const envPasskey = safeGetMpesaPasskey();

    if (!shortcode) {
      shortcode = envShortcode;
    }

    if (!passkey) {
      if (shortcode && envShortcode && shortcode !== envShortcode) {
        return NextResponse.json(
          {
            success: false,
            message: `Missing M-Pesa passkey for shortcode ${shortcode}. Configure the landlord passkey or set MPESA_SHORTCODE/MPESA_PASSKEY for the same shortcode.`,
          },
          { status: 500 }
        );
      }

      if (!envShortcode || !envPasskey) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Missing M-Pesa credentials. Configure landlord shortcode/passkey or platform MPESA_SHORTCODE/MPESA_PASSKEY.",
          },
          { status: 500 }
        );
      }

      passkey = envPasskey;
    }

    if (!shortcode || !passkey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing M-Pesa credentials. Configure landlord shortcode/passkey or platform MPESA_SHORTCODE/MPESA_PASSKEY.",
        },
        { status: 500 }
      );
    }
    const callbackBase = process.env.MPESA_CALLBACK_BASE_URL || "";
    if (!callbackBase) {
      return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
    }

    // Initiate Daraja STK push
    const stkResponse = await initiateStkPush({
      shortcode,
      passkey,
      amount: parsed.data.amount,
      phone: normalizedPhone,
      accountReference: stkAccountReference,
      transactionDesc: `${parsed.data.type || "Rent"} Payment`,
      callbackUrl: `${callbackBase}/api/mpesa/stk-callback`,
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
    await db.collection("payments").insertOne({
      tenantId,
      amount: parsed.data.amount,
      propertyId,
      paymentDate: nowIso,
      transactionId: stkResponse.CheckoutRequestID,
      status: "pending",
      createdAt: nowIso,
      type: parsed.data.type || "Rent",
      phoneNumber: normalizedPhone,
      reference: invoiceReference,
      mpesaCode: null,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      invoiceId: parsed.data.invoiceId,
      landlordId: parsed.data.landlordId,
    });

    return NextResponse.json(
      {
        success: true,
        message: stkResponse.CustomerMessage || "STK Push initiated. Check your phone.",
        checkoutRequestId: stkResponse.CheckoutRequestID,
        merchantRequestId: stkResponse.MerchantRequestID,
        customerMessage: stkResponse.CustomerMessage,
        shortcode,
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

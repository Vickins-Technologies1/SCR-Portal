// src/app/api/mpesa/stk-push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import {
  decryptPasskey,
  getMpesaPasskey,
  getMpesaShortcode,
  initiateStkPush,
  isValidKenyanMsisdn,
  normalizePhoneNumber,
} from "@/lib/mpesa";
import { validateCsrfToken } from "@/lib/csrf";
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

async function resolveMpesaCredentials(landlordId: string): Promise<{
  shortcode: string;
  passkey: string;
  source: "landlord" | "platform";
}> {
  try {
    await connectMongoose();
    const doc = await LandlordMpesa.findOne({ landlord: landlordId })
      .select({ shortcode: 1, passkey: 1 })
      .lean<{ shortcode?: string; passkey?: string }>()
      .exec();

    const shortcode = doc?.shortcode?.trim() || "";
    const rawPasskey = doc?.passkey?.trim() || "";
    if (shortcode && rawPasskey) {
      let resolvedPasskey = rawPasskey;
      try {
        resolvedPasskey = decryptPasskey(rawPasskey);
      } catch {
        // Stored as plain text or missing encryption secret; fallback to raw value.
      }
      if (resolvedPasskey) {
        return { shortcode, passkey: resolvedPasskey, source: "landlord" };
      }
    }
  } catch {
    // Ignore landlord lookup errors and fallback to platform credentials.
  }

  return {
    shortcode: getMpesaShortcode(),
    passkey: getMpesaPasskey(),
    source: "platform",
  };
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
    let derivedLandlordId: string | null = null;

    // Resolve tenant + landlord context
    if (role === "tenant") {
      const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(userId) });
      if (!tenant) {
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }
      tenantId = tenant._id.toString();
      propertyId = tenant.propertyId;
      derivedLandlordId =
        typeof tenant.ownerId === "string"
          ? tenant.ownerId
          : tenant.ownerId?.toString?.() || null;
    }

    // Owner-initiated STK (e.g., platform invoices)
    if (role === "propertyOwner") {
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

    // Resolve M-Pesa credentials (prefer landlord-level, fallback to platform)
    let shortcode = "";
    let passkey = "";
    try {
      const resolved = await resolveMpesaCredentials(derivedLandlordId);
      shortcode = resolved.shortcode;
      passkey = resolved.passkey;
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          message:
            err instanceof Error
              ? err.message
              : "Missing M-Pesa credentials. Configure landlord shortcode/passkey or platform MPESA_SHORTCODE/MPESA_PASSKEY.",
        },
        { status: 500 }
      );
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
    const accountReference = parsed.data.invoiceId.startsWith("INV-")
      ? parsed.data.invoiceId
      : `INV-${parsed.data.invoiceId}`;
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
      accountReference,
      transactionDesc: `${parsed.data.type || "Rent"} Payment`,
      callbackUrl: `${callbackBase}/api/mpesa/stk-callback`,
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
      reference: accountReference,
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

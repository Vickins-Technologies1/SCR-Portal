import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { createTumaBusiness } from "@/lib/tuma";
import { decryptTumaApiKey, encryptTumaApiKey, isLikelyEncryptedTumaApiKey } from "@/lib/tuma-crypto";
import { maskSecret } from "@/lib/owner-integrations";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

const optionalUrl = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  },
  z.string().url().optional()
);

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  },
  z.string().max(1000).optional()
);

const TumaBusinessSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  mobile: z.string().trim().regex(/^254\d{9}$/, "Mobile must be in 254XXXXXXXXX format"),
  bankId: z.string().trim().uuid(),
  accountNumber: z.string().trim().min(5),
  logo: optionalUrl,
  description: optionalText,
});

function maskApiKeyForResponse(storedApiKey: string): string {
  if (!storedApiKey) return "";
  if (isLikelyEncryptedTumaApiKey(storedApiKey)) {
    try {
      return maskSecret(decryptTumaApiKey(storedApiKey));
    } catch {
      return maskSecret(storedApiKey);
    }
  }
  return maskSecret(storedApiKey);
}

export async function POST(request: NextRequest) {
  try {
    const csrfToken = request.headers.get("x-csrf-token");
    if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
      return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
    }

    const resolved = await resolveAirbnbOwner(request, null);
    if (resolved.response) return resolved.response;
    const { ownerId } = resolved.context!;

    if (!ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = TumaBusinessSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const masterEmail = (process.env.TUMA_MASTER_EMAIL || "").trim();
    const masterApiKey = (process.env.TUMA_MASTER_API_KEY || "").trim();
    if (!masterEmail || !masterApiKey) {
      return NextResponse.json(
        { success: false, message: "Missing Tuma master credentials on the server." },
        { status: 500 }
      );
    }

    const { db } = await connectToDatabase();
    const existing = await db.collection("airbnbOwnerIntegrations").findOne(
      { ownerId: new ObjectId(ownerId) },
      { projection: { tuma: 1 } }
    );
    const existingTuma = existing?.tuma || {};
    const existingApiKey = String(existingTuma.apiKey || "").trim();
    const existingEmail = String(existingTuma.email || "").trim();
    const existingBusinessId = String(existingTuma.businessId || "").trim();
    const existingEnabled = existingTuma.enabled !== false;

    if (existingApiKey && existingEmail) {
      return NextResponse.json({
        success: true,
        message: "Tuma business already configured.",
        tuma: {
          enabled: existingEnabled,
          email: existingEmail,
          businessId: existingBusinessId,
          hasApiKey: true,
          maskedApiKey: maskApiKeyForResponse(existingApiKey),
        },
      });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(
      /\/$/,
      ""
    );
    const logoUrl = parsed.data.logo || `${baseUrl}/logo.png`;

    const created = await createTumaBusiness({
      credentials: {
        email: masterEmail,
        apiKey: masterApiKey,
      },
      business: {
        name: parsed.data.name,
        email: parsed.data.email,
        mobile: parsed.data.mobile,
        bankId: parsed.data.bankId,
        accountNumber: parsed.data.accountNumber,
        logo: logoUrl,
        description: parsed.data.description,
      },
    });

    if (!created.apiKey) {
      return NextResponse.json({ success: false, message: "Tuma API did not return an API key." }, { status: 502 });
    }

    const encryptedApiKey = encryptTumaApiKey(created.apiKey);
    const now = new Date().toISOString();
    await db.collection("airbnbOwnerIntegrations").updateOne(
      { ownerId: new ObjectId(ownerId) },
      {
        $set: {
          ownerId: new ObjectId(ownerId),
          tuma: {
            enabled: true,
            email: created.email,
            apiKey: encryptedApiKey,
            businessId: created.id,
            createdAt: now,
            updatedAt: now,
          },
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      message: "Tuma business created successfully.",
      tuma: {
        enabled: true,
        email: created.email,
        businessId: created.id,
        hasApiKey: true,
        maskedApiKey: maskSecret(created.apiKey),
      },
    });
  } catch (error) {
    console.error("POST /api/airbnb/tuma/business error:", error);
    return NextResponse.json({ success: false, message: "Failed to create Tuma business" }, { status: 500 });
  }
}


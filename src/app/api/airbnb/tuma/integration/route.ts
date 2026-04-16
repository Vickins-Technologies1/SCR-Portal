import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { maskSecret } from "@/lib/owner-integrations";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { decryptTumaApiKey, encryptTumaApiKey, isLikelyEncryptedTumaApiKey } from "@/lib/tuma-crypto";

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  },
  z.string().max(500).optional()
);

const TumaIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  email: optionalText.pipe(z.string().email().optional()),
  apiKey: optionalText,
  businessId: optionalText,
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

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAirbnbOwner(request, null);
    if (resolved.response) return resolved.response;
    const { ownerId } = resolved.context!;

    if (!ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: true, tuma: { enabled: true, email: "", businessId: "", hasApiKey: false, maskedApiKey: "" } });
    }

    const { db } = await connectToDatabase();
    const record = await db.collection("airbnbOwnerIntegrations").findOne(
      { ownerId: new ObjectId(ownerId) },
      { projection: { tuma: 1 } }
    );

    const tuma = record?.tuma || {};
    const email = String(tuma.email || "").trim();
    const storedApiKey = String(tuma.apiKey || "").trim();
    const businessId = String(tuma.businessId || "").trim();
    const enabled = tuma.enabled !== false;

    return NextResponse.json({
      success: true,
      tuma: {
        enabled,
        email,
        businessId,
        hasApiKey: !!storedApiKey,
        maskedApiKey: maskApiKeyForResponse(storedApiKey),
      },
    });
  } catch (error) {
    console.error("GET /api/airbnb/tuma/integration error:", error);
    return NextResponse.json({ success: false, message: "Failed to load Tuma integration" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
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

    const parsed = TumaIntegrationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const existing = await db.collection("airbnbOwnerIntegrations").findOne(
      { ownerId: new ObjectId(ownerId) },
      { projection: { tuma: 1 } }
    );
    const existingTuma = existing?.tuma || {};

    const incomingEnabled = parsed.data.enabled;
    const incomingEmail = parsed.data.email;
    const incomingApiKey = parsed.data.apiKey;
    const incomingBusinessId = parsed.data.businessId;

    const nextEnabled = typeof incomingEnabled === "boolean" ? incomingEnabled : existingTuma.enabled !== false;
    const nextEmail = String(incomingEmail || String(existingTuma.email || "")).trim();
    const nextBusinessId = String(incomingBusinessId || String(existingTuma.businessId || "")).trim();

    const existingStoredApiKey = String(existingTuma.apiKey || "").trim();
    let nextStoredApiKey = existingStoredApiKey;
    if (incomingApiKey) {
      nextStoredApiKey = encryptTumaApiKey(incomingApiKey);
    } else if (existingStoredApiKey && !isLikelyEncryptedTumaApiKey(existingStoredApiKey)) {
      try {
        nextStoredApiKey = encryptTumaApiKey(existingStoredApiKey);
      } catch {
        nextStoredApiKey = existingStoredApiKey;
      }
    }

    if (nextEnabled && (!nextEmail || !nextStoredApiKey)) {
      return NextResponse.json(
        { success: false, message: "Tuma email and API key are required when integration is enabled." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await db.collection("airbnbOwnerIntegrations").updateOne(
      { ownerId: new ObjectId(ownerId) },
      {
        $set: {
          ownerId: new ObjectId(ownerId),
          tuma: {
            enabled: nextEnabled,
            email: nextEmail,
            apiKey: nextStoredApiKey,
            businessId: nextBusinessId,
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
      tuma: {
        enabled: nextEnabled,
        email: nextEmail,
        businessId: nextBusinessId,
        hasApiKey: !!nextStoredApiKey,
        maskedApiKey: maskApiKeyForResponse(nextStoredApiKey),
      },
    });
  } catch (error) {
    console.error("PUT /api/airbnb/tuma/integration error:", error);
    return NextResponse.json({ success: false, message: "Failed to update Tuma integration" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    const { db } = await connectToDatabase();
    const now = new Date().toISOString();
    await db.collection("airbnbOwnerIntegrations").updateOne(
      { ownerId: new ObjectId(ownerId) },
      {
        $set: {
          "tuma.enabled": false,
          updatedAt: now,
        },
        $unset: {
          "tuma.apiKey": "",
          "tuma.email": "",
          "tuma.businessId": "",
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      message: "Tuma integration disconnected.",
      tuma: {
        enabled: false,
        email: "",
        businessId: "",
        hasApiKey: false,
        maskedApiKey: "",
      },
    });
  } catch (error) {
    console.error("DELETE /api/airbnb/tuma/integration error:", error);
    return NextResponse.json({ success: false, message: "Failed to disconnect Tuma integration" }, { status: 500 });
  }
}


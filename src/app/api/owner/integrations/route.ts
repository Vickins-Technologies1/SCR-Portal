import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { maskSecret } from "@/lib/owner-integrations";
import { decryptTumaApiKey, encryptTumaApiKey, isLikelyEncryptedTumaApiKey } from "@/lib/tuma-crypto";

type OwnerContext = {
  ownerId: string;
  canView: boolean;
  canEdit: boolean;
};

async function resolveOwnerContext(request: NextRequest): Promise<OwnerContext | null> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["propertyOwner", "teamMember"].includes(role)) {
    return null;
  }

  if (role === "propertyOwner") {
    return { ownerId: userId, canView: true, canEdit: true };
  }

  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });

  if (!member?.ownerId) return null;

  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const canView = permissions.includes("integrations:view") || permissions.includes("settings:view");
  const canEdit = permissions.includes("integrations:edit") || permissions.includes("settings:edit");

  return {
    ownerId: member.ownerId.toString(),
    canView,
    canEdit,
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveOwnerContext(request);
    if (!context) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!context.canView) {
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const record = await db.collection("ownerIntegrations").findOne(
      { ownerId: new ObjectId(context.ownerId) },
      { projection: { tuma: 1 } }
    );

    const tuma = record?.tuma || {};
    const email = String(tuma.email || "").trim();
    const storedApiKey = String(tuma.apiKey || "").trim();
    const businessId = String(tuma.businessId || "").trim();
    const enabled = tuma.enabled !== false;
    let apiKeyForMask = storedApiKey;
    if (storedApiKey && isLikelyEncryptedTumaApiKey(storedApiKey)) {
      try {
        apiKeyForMask = decryptTumaApiKey(storedApiKey);
      } catch {
        apiKeyForMask = storedApiKey;
      }
    }

    return NextResponse.json({
      success: true,
      integrations: {
        tuma: {
          enabled,
          email,
          businessId,
          hasApiKey: !!storedApiKey,
          maskedApiKey: maskSecret(apiKeyForMask),
        },
      },
    });
  } catch (error) {
    console.error("GET /api/owner/integrations error:", error);
    return NextResponse.json({ success: false, message: "Failed to load integrations" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await resolveOwnerContext(request);
    if (!context) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!context.canEdit) {
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    }

    const csrfToken = request.headers.get("x-csrf-token");
    if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
      return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const tumaPayload = payload?.tuma || {};
    const incomingEmail = String(tumaPayload.email || "").trim();
    const incomingApiKey = String(tumaPayload.apiKey || "").trim();
    const incomingBusinessId = String(tumaPayload.businessId || "").trim();
    const incomingEnabled = tumaPayload.enabled !== false;

    const { db } = await connectToDatabase();
    const existing = await db.collection("ownerIntegrations").findOne(
      { ownerId: new ObjectId(context.ownerId) },
      { projection: { tuma: 1 } }
    );
    const existingTuma = existing?.tuma || {};

    const nextEmail = incomingEmail || String(existingTuma.email || "").trim();
    const existingStoredApiKey = String(existingTuma.apiKey || "").trim();
    const nextEnabled = incomingEnabled;
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
    const nextBusinessId = incomingBusinessId || String(existingTuma.businessId || "").trim();

    if (nextEnabled && (!nextEmail || !nextStoredApiKey)) {
      return NextResponse.json(
        { success: false, message: "Tuma email and API key are required when integration is enabled." },
        { status: 400 }
      );
    }

    const updateDoc = {
      ownerId: new ObjectId(context.ownerId),
      tuma: {
        email: nextEmail,
        apiKey: nextStoredApiKey,
        businessId: nextBusinessId,
        enabled: nextEnabled,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    await db.collection("ownerIntegrations").updateOne(
      { ownerId: new ObjectId(context.ownerId) },
      { $set: updateDoc },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      integrations: {
        tuma: {
          enabled: nextEnabled,
          email: nextEmail,
          businessId: nextBusinessId,
          hasApiKey: !!nextStoredApiKey,
          maskedApiKey: maskSecret(
            isLikelyEncryptedTumaApiKey(nextStoredApiKey)
              ? (() => {
                  try {
                    return decryptTumaApiKey(nextStoredApiKey);
                  } catch {
                    return nextStoredApiKey;
                  }
                })()
              : nextStoredApiKey
          ),
        },
      },
    });
  } catch (error) {
    console.error("PUT /api/owner/integrations error:", error);
    return NextResponse.json({ success: false, message: "Failed to update integrations" }, { status: 500 });
  }
}

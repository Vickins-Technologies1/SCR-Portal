import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getOwnerTumaIntegration } from "@/lib/owner-integrations";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const tumaIntegration = await getOwnerTumaIntegration(db, ownerId);
  const tumaStatus = tumaIntegration ? "connected" : "available";

  const integrations = await db
    .collection("airbnbIntegrations")
    .find({ ownerId })
    .sort({ createdAt: 1 })
    .toArray();

  const blockedProviders = new Set(["airbnb", "airbnb-api", "airbnb-sync", "ical", "ical-sync"]);

  const defaults = [
    {
      id: "tuma",
      name: "Tuma M-Pesa Gateway",
      status: tumaStatus,
      description: "Collect booking payments via STK Push (recommended for Kenyan guests).",
      provider: "tuma",
    },
    {
      id: "stripe",
      name: "Stripe Payments",
      status: process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_SECRET_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        ? "connected"
        : "available",
      description: "Accept card payments and handle completed payment webhooks.",
      provider: "stripe",
    },
    {
      id: "email",
      name: "Email Notifications",
      status: process.env.SMTP_USER && process.env.SMTP_PASS ? "connected" : "available",
      description: "Send booking confirmations, payment receipts, and reminders.",
      provider: "smtp",
    },
    {
      id: "ga",
      name: "Google Analytics",
      status: process.env.NEXT_PUBLIC_GA_ID ? "connected" : "available",
      description: "Measure traffic and conversions on public listing pages.",
      provider: "ga",
    },
    {
      id: "meta",
      name: "Meta Pixel",
      status: process.env.NEXT_PUBLIC_META_PIXEL_ID ? "connected" : "available",
      description: "Enable Meta ads conversion tracking.",
      provider: "meta",
    },
  ];

  const defaultProviders = new Set(defaults.map((item) => item.provider));
  const existingByProvider = new Map(
    integrations
      .filter((integration) => {
        const providerKey = (integration.provider || integration.name || "").toLowerCase().replace(/\s+/g, "-");
        return !blockedProviders.has(providerKey);
      })
      .map((integration) => [integration.provider || integration.name?.toLowerCase(), integration])
  );

  const merged = defaults.map((item) => {
    const match = existingByProvider.get(item.provider);
    if (!match) return item;
    return {
      id: match.externalId || match._id?.toString?.() || item.id,
      name: match.name || item.name,
      status: match.status || item.status,
      description: match.description || item.description,
      provider: match.provider || item.provider,
      config: match.config || {},
    };
  });

  const custom = integrations
    .filter((integration) => {
      const providerKey = (integration.provider || integration.name || "").toLowerCase().replace(/\s+/g, "-");
      return !defaultProviders.has(integration.provider) && !blockedProviders.has(providerKey);
    })
    .map((integration) => ({
      id: integration.externalId || integration._id?.toString?.() || "",
      name: integration.name,
      status: integration.status,
      description: integration.description,
      provider: integration.provider,
      config: integration.config || {},
    }));

  return NextResponse.json({
    success: true,
    integrations: [...merged, ...custom],
  });
}

const IntegrationSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2),
  description: z.string().trim().min(2),
  status: z.enum(["connected", "available", "coming_soon"]),
  provider: z.string().trim().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = IntegrationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid integration payload" }, { status: 400 });
  }

  const normalizedProvider = (parsed.data.provider || parsed.data.name || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (normalizedProvider.startsWith("airbnb") || normalizedProvider.startsWith("ical")) {
    return NextResponse.json(
      { success: false, message: "Sync integrations are no longer supported." },
      { status: 400 }
    );
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();

  const integrationId = parsed.data.id || `int-${new ObjectId().toString()}`;
  const filter = ObjectId.isValid(integrationId)
    ? { _id: new ObjectId(integrationId), ownerId }
    : { externalId: integrationId, ownerId };

  const updateDoc = {
    ownerId,
    externalId: integrationId,
    name: parsed.data.name,
    status: parsed.data.status,
    description: parsed.data.description,
    provider: parsed.data.provider || parsed.data.name.toLowerCase().replace(/\s+/g, "-"),
    config: parsed.data.config || {},
    updatedAt: now,
  };

  const result = await db.collection("airbnbIntegrations").findOneAndUpdate(
    filter,
    { $set: updateDoc, $setOnInsert: { createdAt: now } },
    { upsert: true, returnDocument: "after" }
  );

  const updated = result?.value;

  return NextResponse.json({
    success: true,
    integration: {
      id: updated?.externalId || updated?._id?.toString?.() || integrationId,
      name: updated?.name || parsed.data.name,
      status: updated?.status || parsed.data.status,
      description: updated?.description || parsed.data.description,
      provider: updated?.provider,
      config: updated?.config || parsed.data.config || {},
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const integrations = await db
    .collection("airbnbIntegrations")
    .find({ ownerId })
    .sort({ createdAt: 1 })
    .toArray();

  return NextResponse.json({
    success: true,
    integrations: integrations.map((integration) => ({
      id: integration.externalId || integration._id?.toString?.() || "",
      name: integration.name,
      status: integration.status,
      description: integration.description,
      provider: integration.provider,
      config: integration.config || {},
      health: integration.health || undefined,
    })),
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

  if (parsed.data.status === "connected") {
    const baseUrl = parsed.data.config?.baseUrl?.trim?.() || "";
    const accessToken = parsed.data.config?.accessToken?.trim?.() || "";
    if (!baseUrl || !accessToken) {
      return NextResponse.json(
        { success: false, message: "Base URL and access token are required to connect this integration." },
        { status: 400 }
      );
    }
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

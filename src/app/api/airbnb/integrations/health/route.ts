import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { checkAirbnbChannelHealth } from "@/lib/airbnb-channel-manager";

const HealthSchema = z.object({
  integrationId: z.string().min(1),
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

  const parsed = HealthSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid health check payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const integrationId = parsed.data.integrationId;
  const filter = ObjectId.isValid(integrationId)
    ? { _id: new ObjectId(integrationId), ownerId }
    : { externalId: integrationId, ownerId };

  const integration = await db.collection("airbnbIntegrations").findOne(filter);
  if (!integration) {
    return NextResponse.json({ success: false, message: "Integration not found" }, { status: 404 });
  }

  const health = await checkAirbnbChannelHealth({
    db,
    ownerId,
    integration: { _id: integration._id, config: integration.config || {} },
  });

  await db.collection("airbnbIntegrations").updateOne(
    { _id: integration._id },
    {
      $set: {
        health,
        lastCheckedAt: health.checkedAt,
        updatedAt: health.checkedAt,
      },
    }
  );

  return NextResponse.json({ success: true, health });
}

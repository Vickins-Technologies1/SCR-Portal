import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

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
    })),
  });
}

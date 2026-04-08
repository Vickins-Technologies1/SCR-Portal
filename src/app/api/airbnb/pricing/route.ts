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

  const rules = await db
    .collection("airbnbPricingRules")
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    success: true,
    rules: rules.map((rule) => ({
      id: rule.externalId || rule._id?.toString?.() || "",
      name: rule.name,
      description: rule.description,
      adjustment: rule.adjustment,
      active: Boolean(rule.active),
    })),
  });
}

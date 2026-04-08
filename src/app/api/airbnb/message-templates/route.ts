import { NextRequest, NextResponse } from "next/server";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { AIRBNB_MESSAGE_TEMPLATES } from "@/lib/airbnb-messaging";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;

  return NextResponse.json({
    success: true,
    templates: AIRBNB_MESSAGE_TEMPLATES,
  });
}

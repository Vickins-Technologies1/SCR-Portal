import { NextRequest, NextResponse } from "next/server";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");
  const conversationId = searchParams.get("conversationId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  if (!conversationId) {
    return NextResponse.json({ success: false, message: "Missing conversationId" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const logs = await db
    .collection("airbnbMessageDeliveries")
    .find({ ownerId, conversationId })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  return NextResponse.json({
    success: true,
    deliveries: logs.map((log) => ({
      id: log._id?.toString?.() || "",
      channel: log.channel,
      recipient: log.recipient,
      status: log.status,
      provider: log.provider,
      message: log.error || undefined,
      createdAt: log.createdAt,
    })),
  });
}

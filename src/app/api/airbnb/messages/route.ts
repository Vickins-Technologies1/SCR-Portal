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

  const conversations = await db
    .collection("airbnbConversations")
    .find({ ownerId })
    .sort({ lastMessageAt: -1 })
    .toArray();

  return NextResponse.json({
    success: true,
    conversations: conversations.map((convo) => ({
      id: convo.externalId || convo._id?.toString?.() || "",
      guestName: convo.guestName,
      listingName: convo.listingName,
      lastMessage: convo.lastMessage,
      unread: convo.unread ?? 0,
      channel: convo.channel || "Airbnb",
      lastMessageAt: convo.lastMessageAt,
    })),
  });
}

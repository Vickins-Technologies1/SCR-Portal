import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { syncAirbnbChannel } from "@/lib/airbnb-channel-manager";

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  let integration = await db.collection("airbnbIntegrations").findOne({ ownerId, provider: "airbnb" });
  if (!integration) {
    const hasEnvConfig = !!(process.env.AIRBNB_CHANNEL_MANAGER_BASE_URL && process.env.AIRBNB_ACCESS_TOKEN);
    if (!hasEnvConfig) {
      return NextResponse.json(
        { success: false, message: "Airbnb integration not configured for this owner." },
        { status: 404 }
      );
    }
    const now = new Date().toISOString();
    const insert = await db.collection("airbnbIntegrations").insertOne({
      ownerId,
      externalId: `airbnb-${ownerId}`,
      name: "Airbnb Channel Manager API",
      status: "connected",
      description: "Two-way sync for listings, calendar, rates, and messaging.",
      provider: "airbnb",
      config: {
        baseUrl: process.env.AIRBNB_CHANNEL_MANAGER_BASE_URL || "",
        listingsPath: process.env.AIRBNB_LISTINGS_ENDPOINT || "/listings",
        reservationsPath: process.env.AIRBNB_RESERVATIONS_ENDPOINT || "/reservations",
        calendarPath: process.env.AIRBNB_CALENDAR_ENDPOINT || "/calendar",
        messagesPath: process.env.AIRBNB_MESSAGES_ENDPOINT || "/messages",
        accessToken: process.env.AIRBNB_ACCESS_TOKEN || "",
        refreshToken: process.env.AIRBNB_REFRESH_TOKEN || "",
        tokenUrl: process.env.AIRBNB_TOKEN_URL || "",
        clientId: process.env.AIRBNB_CLIENT_ID || "",
        clientSecret: process.env.AIRBNB_CLIENT_SECRET || "",
      },
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    integration = await db.collection("airbnbIntegrations").findOne({ _id: insert.insertedId });
  }

  if (!integration) {
    return NextResponse.json(
      { success: false, message: "Airbnb integration could not be resolved." },
      { status: 500 }
    );
  }

  try {
    const result = await syncAirbnbChannel({
      db,
      ownerId,
      integration: {
        _id: integration._id,
        config: integration.config || {},
      },
    });
    return NextResponse.json({
      success: true,
      syncedAt: result.syncedAt,
      message: "Airbnb channel sync completed.",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Airbnb sync failed.",
      },
      { status: 500 }
    );
  }
}

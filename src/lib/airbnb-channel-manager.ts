import "server-only";
import { Db, ObjectId } from "mongodb";
import logger from "./logger";
import { mapAirbnbConversation, mapAirbnbListing, mapAirbnbReservation } from "./airbnb-sync";

export type AirbnbChannelConfig = {
  baseUrl: string;
  listingsPath: string;
  reservationsPath: string;
  calendarPath?: string;
  messagesPath?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
};

type AirbnbSyncResult = {
  listings: number;
  reservations: number;
  messages: number;
  calendar: number;
  syncedAt: string;
};

export type AirbnbChannelHealth = {
  status: "healthy" | "degraded" | "down";
  checkedAt: string;
  endpoints: Array<{
    name: string;
    url: string;
    ok: boolean;
    status?: number;
    message?: string;
  }>;
};

const DEFAULT_BASE_URL = process.env.AIRBNB_CHANNEL_MANAGER_BASE_URL || "";
const DEFAULT_LISTINGS_PATH = process.env.AIRBNB_LISTINGS_ENDPOINT || "/listings";
const DEFAULT_RESERVATIONS_PATH = process.env.AIRBNB_RESERVATIONS_ENDPOINT || "/reservations";
const DEFAULT_CALENDAR_PATH = process.env.AIRBNB_CALENDAR_ENDPOINT || "/calendar";
const DEFAULT_MESSAGES_PATH = process.env.AIRBNB_MESSAGES_ENDPOINT || "/messages";
const DEFAULT_TOKEN_URL = process.env.AIRBNB_TOKEN_URL || "";
const DEFAULT_CLIENT_ID = process.env.AIRBNB_CLIENT_ID || "";
const DEFAULT_CLIENT_SECRET = process.env.AIRBNB_CLIENT_SECRET || "";

const parseJson = async (res: Response) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

async function refreshAccessToken(config: AirbnbChannelConfig) {
  if (!config.refreshToken || !config.tokenUrl || !config.clientId || !config.clientSecret) {
    return null;
  }
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    logger.error("Airbnb token refresh failed", { status: res.status });
    return null;
  }
  const data = await parseJson(res);
  if (!data?.access_token) {
    return null;
  }
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) || config.refreshToken,
    expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : undefined,
  };
}

function shouldRefreshToken(tokenExpiresAt?: string) {
  if (!tokenExpiresAt) return false;
  const expiry = new Date(tokenExpiresAt);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() - Date.now() < 5 * 60 * 1000;
}

async function fetchEndpoint(baseUrl: string, path: string, token: string) {
  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = await parseJson(res);
  if (!res.ok) {
    logger.error("Airbnb sync fetch failed", { url, status: res.status, data });
    throw new Error(`Failed to fetch ${url}`);
  }
  return data;
}

async function probeEndpoint(baseUrl: string, path: string, token: string) {
  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await parseJson(res);
    return {
      name: path,
      url,
      ok: res.ok,
      status: res.status,
      message: res.ok ? undefined : data?.message || data?.error || res.statusText,
    };
  } catch (error) {
    return {
      name: path,
      url,
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function checkAirbnbChannelHealth(params: {
  db: Db;
  ownerId: string;
  integration: { _id: ObjectId | string; config: Partial<AirbnbChannelConfig> };
}): Promise<AirbnbChannelHealth> {
  const { db, ownerId, integration } = params;
  const integrationId =
    integration._id instanceof ObjectId
      ? integration._id
      : typeof integration._id === "string" && ObjectId.isValid(integration._id)
        ? new ObjectId(integration._id)
        : null;

  const config: AirbnbChannelConfig = {
    baseUrl: integration.config.baseUrl || DEFAULT_BASE_URL,
    listingsPath: integration.config.listingsPath || DEFAULT_LISTINGS_PATH,
    reservationsPath: integration.config.reservationsPath || DEFAULT_RESERVATIONS_PATH,
    calendarPath: integration.config.calendarPath || DEFAULT_CALENDAR_PATH,
    messagesPath: integration.config.messagesPath || DEFAULT_MESSAGES_PATH,
    accessToken: integration.config.accessToken || process.env.AIRBNB_ACCESS_TOKEN || "",
    refreshToken: integration.config.refreshToken || process.env.AIRBNB_REFRESH_TOKEN || "",
    tokenExpiresAt: integration.config.tokenExpiresAt,
    tokenUrl: integration.config.tokenUrl || DEFAULT_TOKEN_URL,
    clientId: integration.config.clientId || DEFAULT_CLIENT_ID,
    clientSecret: integration.config.clientSecret || DEFAULT_CLIENT_SECRET,
  };

  if (!config.baseUrl || !config.accessToken) {
    return {
      status: "down",
      checkedAt: new Date().toISOString(),
      endpoints: [
        {
          name: "config",
          url: config.baseUrl || "missing baseUrl",
          ok: false,
          status: 0,
          message: "Missing channel manager base URL or access token.",
        },
      ],
    };
  }

  let activeToken = config.accessToken;
  if (shouldRefreshToken(config.tokenExpiresAt)) {
    const refreshed = await refreshAccessToken(config);
    if (refreshed?.accessToken) {
      activeToken = refreshed.accessToken;
      if (integrationId) {
        await db.collection("airbnbIntegrations").updateOne(
          { _id: integrationId },
          {
            $set: {
              "config.accessToken": refreshed.accessToken,
              "config.refreshToken": refreshed.refreshToken,
              "config.tokenExpiresAt": refreshed.expiresAt,
              updatedAt: new Date().toISOString(),
            },
          }
        );
      } else {
        logger.warn("Airbnb integration id missing; token refresh not persisted.", { ownerId });
      }
    }
  }

  const endpoints = [
    await probeEndpoint(config.baseUrl, config.listingsPath, activeToken),
    await probeEndpoint(config.baseUrl, config.reservationsPath, activeToken),
    config.calendarPath ? await probeEndpoint(config.baseUrl, config.calendarPath, activeToken) : null,
    config.messagesPath ? await probeEndpoint(config.baseUrl, config.messagesPath, activeToken) : null,
  ].filter(Boolean) as AirbnbChannelHealth["endpoints"];

  const okCount = endpoints.filter((endpoint) => endpoint.ok).length;
  const status = okCount === endpoints.length ? "healthy" : okCount > 0 ? "degraded" : "down";

  return {
    status,
    checkedAt: new Date().toISOString(),
    endpoints,
  };
}

export async function syncAirbnbChannel(params: {
  db: Db;
  ownerId: string;
  integration: { _id: ObjectId | string; config: Partial<AirbnbChannelConfig> };
}): Promise<AirbnbSyncResult> {
  const { db, ownerId, integration } = params;
  const integrationId =
    integration._id instanceof ObjectId
      ? integration._id
      : typeof integration._id === "string" && ObjectId.isValid(integration._id)
        ? new ObjectId(integration._id)
        : null;
  const config: AirbnbChannelConfig = {
    baseUrl: integration.config.baseUrl || DEFAULT_BASE_URL,
    listingsPath: integration.config.listingsPath || DEFAULT_LISTINGS_PATH,
    reservationsPath: integration.config.reservationsPath || DEFAULT_RESERVATIONS_PATH,
    calendarPath: integration.config.calendarPath || DEFAULT_CALENDAR_PATH,
    messagesPath: integration.config.messagesPath || DEFAULT_MESSAGES_PATH,
    accessToken: integration.config.accessToken || process.env.AIRBNB_ACCESS_TOKEN || "",
    refreshToken: integration.config.refreshToken || process.env.AIRBNB_REFRESH_TOKEN || "",
    tokenExpiresAt: integration.config.tokenExpiresAt,
    tokenUrl: integration.config.tokenUrl || DEFAULT_TOKEN_URL,
    clientId: integration.config.clientId || DEFAULT_CLIENT_ID,
    clientSecret: integration.config.clientSecret || DEFAULT_CLIENT_SECRET,
  };

  if (!config.baseUrl || !config.accessToken) {
    throw new Error("Airbnb Channel Manager configuration is missing.");
  }

  let activeToken = config.accessToken;
  if (shouldRefreshToken(config.tokenExpiresAt)) {
    const refreshed = await refreshAccessToken(config);
    if (refreshed?.accessToken) {
      activeToken = refreshed.accessToken;
      if (integrationId) {
        await db.collection("airbnbIntegrations").updateOne(
          { _id: integrationId },
          {
            $set: {
              "config.accessToken": refreshed.accessToken,
              "config.refreshToken": refreshed.refreshToken,
              "config.tokenExpiresAt": refreshed.expiresAt,
              updatedAt: new Date().toISOString(),
            },
          }
        );
      } else {
        logger.warn("Airbnb integration id missing; token refresh not persisted.", { ownerId });
      }
    }
  }

  const listingsPayload = await fetchEndpoint(config.baseUrl, config.listingsPath, activeToken);
  const reservationsPayload = await fetchEndpoint(config.baseUrl, config.reservationsPath, activeToken);
  const calendarPayload = config.calendarPath
    ? await fetchEndpoint(config.baseUrl, config.calendarPath, activeToken)
    : { data: [] };
  const messagesPayload = config.messagesPath
    ? await fetchEndpoint(config.baseUrl, config.messagesPath, activeToken)
    : { data: [] };

  const listingItems: Record<string, unknown>[] = Array.isArray(listingsPayload?.data)
    ? listingsPayload.data
    : Array.isArray(listingsPayload)
      ? listingsPayload
      : [];

  const listingMap = new Map<string, { id: string; name: string }>();
  const listingDocs = listingItems.map((item) => {
    const doc = mapAirbnbListing(item, ownerId);
    listingMap.set(doc.externalId, { id: doc.externalId, name: doc.name });
    return doc;
  });

  for (const doc of listingDocs) {
    await db.collection("airbnbListings").updateOne(
      { ownerId, externalId: doc.externalId },
      { $set: { ...doc, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }

  const reservationItems: Record<string, unknown>[] = Array.isArray(reservationsPayload?.data)
    ? reservationsPayload.data
    : Array.isArray(reservationsPayload)
      ? reservationsPayload
      : [];

  let reservationCount = 0;
  for (const item of reservationItems) {
    const listingId =
      (item.listing_id as string | undefined) ||
      (item.property_id as string | undefined) ||
      listingItems[0]?.id?.toString?.() ||
      "";
    const listingName = listingMap.get(listingId)?.name || (item.listing_name as string) || "Airbnb Listing";
    const doc = mapAirbnbReservation(item, ownerId, listingId, listingName);
    await db.collection("airbnbBookings").updateOne(
      { ownerId, externalId: doc.externalId },
      { $set: { ...doc, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    reservationCount += 1;
  }

  const messageItems: Record<string, unknown>[] = Array.isArray(messagesPayload?.data)
    ? messagesPayload.data
    : Array.isArray(messagesPayload)
      ? messagesPayload
      : [];

  let messageCount = 0;
  for (const item of messageItems) {
    const listingId =
      (item.listing_id as string | undefined) ||
      (item.property_id as string | undefined) ||
      listingItems[0]?.id?.toString?.() ||
      "";
    const listingName = listingMap.get(listingId)?.name || (item.listing_name as string) || "Airbnb Listing";
    const doc = mapAirbnbConversation(item, ownerId, listingId, listingName);
    await db.collection("airbnbConversations").updateOne(
      { ownerId, externalId: doc.externalId },
      { $set: { ...doc, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    messageCount += 1;
  }

  const calendarItems: Record<string, unknown>[] = Array.isArray(calendarPayload?.data)
    ? calendarPayload.data
    : Array.isArray(calendarPayload)
      ? calendarPayload
      : [];

  let calendarCount = 0;
  for (const item of calendarItems) {
    const listingId =
      (item.listing_id as string | undefined) ||
      (item.property_id as string | undefined) ||
      listingItems[0]?.id?.toString?.() ||
      "";
    const listingName = listingMap.get(listingId)?.name || (item.listing_name as string) || "Airbnb Listing";
    const date = (item.date as string | undefined) || (item.night as string | undefined);
    if (!date) continue;
    await db.collection("airbnbCalendar").updateOne(
      { ownerId, listingId, date },
      {
        $set: {
          ownerId,
          listingId,
          listingName,
          date,
          status: (item.status as string) || "available",
          rate: Number(item.rate || item.price || 0),
          note: item.note || item.reason || null,
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true }
    );
    calendarCount += 1;
  }

  const syncedAt = new Date().toISOString();
  if (integrationId) {
    await db.collection("airbnbIntegrations").updateOne(
      { _id: integrationId },
      { $set: { lastSyncedAt: syncedAt, status: "connected", updatedAt: syncedAt } }
    );
  } else {
    logger.warn("Airbnb integration id missing; sync timestamp not persisted.", { ownerId });
  }

  return {
    listings: listingDocs.length,
    reservations: reservationCount,
    messages: messageCount,
    calendar: calendarCount,
    syncedAt,
  };
}

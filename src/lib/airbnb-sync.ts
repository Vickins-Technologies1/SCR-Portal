import { diffNights, parseDate, toIso } from "./airbnb-utils";

export type AirbnbListingDoc = {
  _id?: unknown;
  ownerId: string;
  externalId: string;
  name: string;
  location: string;
  status: "draft" | "published" | "paused";
  units: number;
  baseRate: number;
  weekendRate: number;
  occupancyRate: number;
  rating: number;
  reviewCount: number;
  lastSyncedAt: string;
  amenities: string[];
  houseRules: string[];
  licenseStatus: "valid" | "due" | "missing";
  createdAt: string;
  updatedAt: string;
};

export type AirbnbBookingDoc = {
  _id?: unknown;
  ownerId: string;
  externalId: string;
  listingId: string;
  listingName: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  status: "confirmed" | "pending" | "cancelled" | "modified";
  source: "Airbnb" | "Direct";
  payoutStatus: "pending" | "paid" | "failed";
  specialRequests?: string;
  createdAt: string;
  updatedAt: string;
};

export type AirbnbConversationDoc = {
  _id?: unknown;
  ownerId: string;
  externalId: string;
  listingId: string;
  listingName: string;
  guestName: string;
  lastMessage: string;
  unread: number;
  channel: "Airbnb" | "In-app";
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

const pickString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
};

const pickNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }
  return fallback;
};

const pickArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => pickString(item)).filter(Boolean);
  return [];
};

const normalizeListingStatus = (value?: string): AirbnbListingDoc["status"] => {
  const normalized = (value || "").toLowerCase();
  if (["active", "published", "live"].includes(normalized)) return "published";
  if (["paused", "inactive", "snoozed"].includes(normalized)) return "paused";
  return "draft";
};

const normalizeBookingStatus = (value?: string): AirbnbBookingDoc["status"] => {
  const normalized = (value || "").toLowerCase();
  if (["accepted", "confirmed", "active"].includes(normalized)) return "confirmed";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (["modified", "altered", "changed"].includes(normalized)) return "modified";
  return "pending";
};

const normalizePayoutStatus = (value?: string): AirbnbBookingDoc["payoutStatus"] => {
  const normalized = (value || "").toLowerCase();
  if (["paid", "complete", "completed"].includes(normalized)) return "paid";
  if (["failed", "reversed"].includes(normalized)) return "failed";
  return "pending";
};

const normalizeLicenseStatus = (value?: string): AirbnbListingDoc["licenseStatus"] => {
  const normalized = (value || "").toLowerCase();
  if (["valid", "active", "compliant"].includes(normalized)) return "valid";
  if (["due", "expiring"].includes(normalized)) return "due";
  return "missing";
};

const toIsoSafe = (value: unknown, fallback = new Date()): string => {
  if (typeof value === "string" || value instanceof Date) {
    return toIso(value as string | Date);
  }
  return fallback.toISOString();
};

export function mapAirbnbListing(raw: Record<string, unknown>, ownerId: string): AirbnbListingDoc {
  const externalId =
    pickString(raw.id) ||
    pickString(raw.listing_id) ||
    pickString(raw.property_id) ||
    pickString(raw.airbnb_id) ||
    pickString(raw.external_id) ||
    `airbnb-${Math.random().toString(36).slice(2, 8)}`;

  const name = pickString(raw.name) || pickString(raw.title) || "Airbnb Listing";
  const location =
    pickString(raw.location) ||
    pickString(raw.address) ||
    pickString(raw.city) ||
    pickString(raw.market) ||
    "Kenya";

  const baseRate =
    pickNumber(raw.base_rate) ||
    pickNumber(raw.baseRate) ||
    pickNumber(raw.price) ||
    pickNumber(raw.nightly_rate) ||
    0;

  const weekendRate =
    pickNumber(raw.weekend_rate) ||
    pickNumber(raw.weekendRate) ||
    pickNumber(raw.weekend_price) ||
    baseRate;

  const occupancyRate =
    pickNumber(raw.occupancy_rate) ||
    pickNumber(raw.occupancy) ||
    pickNumber(raw.occupancyRate) ||
    0;

  const rating =
    pickNumber(raw.rating) ||
    pickNumber(raw.review_score) ||
    pickNumber(raw.reviewScore) ||
    0;

  const reviewCount =
    pickNumber(raw.review_count) ||
    pickNumber(raw.reviews_count) ||
    pickNumber(raw.reviewCount) ||
    0;

  const nowIso = new Date().toISOString();

  return {
    ownerId,
    externalId,
    name,
    location,
    status: normalizeListingStatus(pickString(raw.status) || pickString(raw.state)),
    units: Math.max(1, pickNumber(raw.units) || pickNumber(raw.unit_count) || 1),
    baseRate,
    weekendRate,
    occupancyRate,
    rating,
    reviewCount,
    lastSyncedAt: nowIso,
    amenities: pickArray(raw.amenities),
    houseRules: pickArray(raw.house_rules || raw.houseRules),
    licenseStatus: normalizeLicenseStatus(
      pickString(raw.license_status) || pickString((raw.compliance as any)?.status)
    ),
    createdAt: toIsoSafe(raw.created_at, new Date()),
    updatedAt: toIsoSafe(raw.updated_at, new Date()),
  };
}

export function mapAirbnbReservation(
  raw: Record<string, unknown>,
  ownerId: string,
  listingId: string,
  listingName: string
): AirbnbBookingDoc {
  const externalId =
    pickString(raw.id) ||
    pickString(raw.reservation_id) ||
    pickString(raw.confirmation_code) ||
    pickString(raw.external_id) ||
    `res-${Math.random().toString(36).slice(2, 8)}`;

  const checkInDate =
    parseDate(pickString(raw.check_in) || pickString(raw.start_date) || pickString(raw.arrival)) ||
    new Date();
  const checkOutDate =
    parseDate(pickString(raw.check_out) || pickString(raw.end_date) || pickString(raw.departure)) ||
    new Date(checkInDate.getTime() + 86400000);

  const guest = (raw.guest as Record<string, unknown> | undefined) || {};
  const guestName = pickString(guest.name) || pickString(raw.guest_name) || "Guest";

  return {
    ownerId,
    externalId,
    listingId,
    listingName,
    guestName,
    guestEmail: pickString(guest.email) || pickString(raw.guest_email),
    guestPhone: pickString(guest.phone) || pickString(raw.guest_phone),
    checkIn: checkInDate.toISOString(),
    checkOut: checkOutDate.toISOString(),
    nights: pickNumber(raw.nights) || diffNights(checkInDate, checkOutDate),
    total:
      pickNumber(raw.total_price) ||
      pickNumber(raw.total) ||
      pickNumber(raw.payout_total) ||
      0,
    status: normalizeBookingStatus(pickString(raw.status)),
    source: (pickString(raw.channel) || pickString(raw.source) || "Airbnb") === "Airbnb" ? "Airbnb" : "Direct",
    payoutStatus: normalizePayoutStatus(pickString(raw.payout_status)),
    specialRequests: pickString(raw.special_requests) || pickString(raw.notes),
    createdAt: toIsoSafe(raw.created_at, new Date()),
    updatedAt: toIsoSafe(raw.updated_at, new Date()),
  };
}

export function mapAirbnbConversation(
  raw: Record<string, unknown>,
  ownerId: string,
  listingId: string,
  listingName: string
): AirbnbConversationDoc {
  const externalId =
    pickString(raw.id) ||
    pickString(raw.conversation_id) ||
    pickString(raw.thread_id) ||
    `msg-${Math.random().toString(36).slice(2, 8)}`;

  const guest = (raw.guest as Record<string, unknown> | undefined) || {};
  const guestName = pickString(guest.name) || pickString(raw.guest_name) || "Guest";

  return {
    ownerId,
    externalId,
    listingId,
    listingName,
    guestName,
    lastMessage: pickString(raw.last_message) || pickString(raw.message) || "",
    unread: Math.max(0, pickNumber(raw.unread) || pickNumber(raw.unread_count) || 0),
    channel: "Airbnb",
    lastMessageAt: toIsoSafe(raw.last_message_at || raw.updated_at, new Date()),
    createdAt: toIsoSafe(raw.created_at, new Date()),
    updatedAt: toIsoSafe(raw.updated_at, new Date()),
  };
}

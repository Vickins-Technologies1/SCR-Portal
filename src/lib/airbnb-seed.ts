import { Db, ObjectId } from "mongodb";
import {
  getSampleAirbnbBookings,
  getSampleAirbnbCalendar,
  getSampleAirbnbCompliance,
  getSampleAirbnbConversations,
  getSampleAirbnbIntegrations,
  getSampleAirbnbListings,
  getSampleAirbnbPayouts,
  getSampleAirbnbPricingRules,
  getSampleAirbnbTasks,
} from "./airbnb-sample";

const COLLECTIONS = {
  listings: "airbnbListings",
  bookings: "airbnbBookings",
  conversations: "airbnbConversations",
  calendar: "airbnbCalendar",
  pricingRules: "airbnbPricingRules",
  tasks: "airbnbTasks",
  payouts: "airbnbPayouts",
  compliance: "airbnbCompliance",
  integrations: "airbnbIntegrations",
} as const;

const shouldSeed = () => process.env.AIRBNB_SEED_ON_EMPTY !== "false";

export async function ensureAirbnbSeed(db: Db, ownerId: string) {
  if (!shouldSeed()) return;

  const existing = await db.collection(COLLECTIONS.listings).countDocuments({ ownerId });
  if (existing > 0) return;

  const now = new Date().toISOString();
  const listings = getSampleAirbnbListings();
  const listingDocs = listings.map((listing) => {
    const _id = new ObjectId();
    return {
      _id,
      ownerId,
      externalId: listing.id,
      name: listing.name,
      location: listing.location,
      status: listing.status,
      units: listing.units,
      baseRate: listing.baseRate,
      weekendRate: listing.weekendRate,
      occupancyRate: listing.occupancyRate,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      lastSyncedAt: listing.lastSyncedAt,
      amenities: listing.amenities,
      houseRules: listing.houseRules,
      licenseStatus: listing.licenseStatus,
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.collection(COLLECTIONS.listings).insertMany(listingDocs);

  const listingIdByName = new Map(
    listingDocs.map((doc) => [doc.name, doc.externalId])
  );

  const bookings = getSampleAirbnbBookings();
  await db.collection(COLLECTIONS.bookings).insertMany(
    bookings.map((booking) => ({
      _id: new ObjectId(),
      ownerId,
      externalId: booking.id,
      listingId: listingIdByName.get(booking.listingName) || booking.listingName,
      listingName: booking.listingName,
      guestName: booking.guestName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      total: booking.total,
      status: booking.status,
      source: booking.source,
      payoutStatus: booking.payoutStatus,
      specialRequests: booking.specialRequests,
      createdAt: now,
      updatedAt: now,
    }))
  );

  const conversations = getSampleAirbnbConversations();
  await db.collection(COLLECTIONS.conversations).insertMany(
    conversations.map((convo) => ({
      _id: new ObjectId(),
      ownerId,
      externalId: convo.id,
      listingId: listingIdByName.get(convo.listingName) || convo.listingName,
      listingName: convo.listingName,
      guestName: convo.guestName,
      lastMessage: convo.lastMessage,
      unread: convo.unread,
      channel: convo.channel,
      lastMessageAt: convo.lastMessageAt,
      createdAt: now,
      updatedAt: now,
    }))
  );

  const calendar = getSampleAirbnbCalendar();
  const calendarDocs = calendar.flatMap((row) =>
    row.nights.map((night) => ({
      _id: new ObjectId(),
      ownerId,
      listingId: listingIdByName.get(row.propertyName) || row.propertyName,
      listingName: row.propertyName,
      date: night.date,
      status: night.status,
      rate: night.rate,
      note: night.note,
      createdAt: now,
      updatedAt: now,
    }))
  );
  if (calendarDocs.length > 0) {
    await db.collection(COLLECTIONS.calendar).insertMany(calendarDocs);
  }

  await db.collection(COLLECTIONS.pricingRules).insertMany(
    getSampleAirbnbPricingRules().map((rule) => ({
      _id: new ObjectId(),
      ownerId,
      externalId: rule.id,
      name: rule.name,
      description: rule.description,
      adjustment: rule.adjustment,
      active: rule.active,
      createdAt: now,
      updatedAt: now,
    }))
  );

  await db.collection(COLLECTIONS.tasks).insertMany(
    getSampleAirbnbTasks().map((task) => ({
      _id: new ObjectId(),
      ownerId,
      externalId: task.id,
      title: task.title,
      propertyName: task.propertyName,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo,
      status: task.status,
      checklist: task.checklist,
      createdAt: now,
      updatedAt: now,
    }))
  );

  await db.collection(COLLECTIONS.payouts).insertMany(
    getSampleAirbnbPayouts().map((payout) => ({
      _id: new ObjectId(),
      ownerId,
      externalId: payout.id,
      propertyName: payout.propertyName,
      amount: payout.amount,
      period: payout.period,
      status: payout.status,
      method: payout.method,
      createdAt: now,
      updatedAt: now,
    }))
  );

  await db.collection(COLLECTIONS.compliance).insertMany(
    getSampleAirbnbCompliance().map((item) => ({
      _id: new ObjectId(),
      ownerId,
      externalId: item.propertyId,
      propertyName: item.propertyName,
      ktraLicense: item.ktraLicense,
      ktraExpiry: item.ktraExpiry,
      countyPermitExpiry: item.countyPermitExpiry,
      nemaExpiry: item.nemaExpiry,
      status: item.status,
      nextAction: item.nextAction,
      createdAt: now,
      updatedAt: now,
    }))
  );

  await db.collection(COLLECTIONS.integrations).insertMany(
    getSampleAirbnbIntegrations().map((integration) => {
      const provider = integration.name.toLowerCase().includes("airbnb")
        ? "airbnb"
        : integration.name.toLowerCase().includes("m-pesa")
          ? "mpesa"
          : "other";

      const config =
        provider === "airbnb"
          ? {
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
            }
          : {};

      return {
        _id: new ObjectId(),
        ownerId,
        externalId: integration.id,
        name: integration.name,
        status: integration.status,
        description: integration.description,
        provider,
        config,
        lastSyncedAt: integration.status === "connected" ? now : null,
        createdAt: now,
        updatedAt: now,
      };
    })
  );
}

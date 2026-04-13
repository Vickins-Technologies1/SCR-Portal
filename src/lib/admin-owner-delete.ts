import { Db, MongoClient, ObjectId } from "mongodb";

export interface OwnerDeletionCounts {
  owner: number;
  properties: number;
  tenants: number;
  invoices: number;
  payments: number;
}

const OWNER_SCOPED_COLLECTIONS = [
  "teamMembers",
  "notifications",
  "rentPriceOverrides",
  "tenant_deletion_requests",
  "vacate_requests",
  "maintenance_requests",
  "supportMessages",
  "supportTickets",
  "ownerIntegrations",
  "paymentSettings",
  "propertyListings",
  "airbnbListings",
  "airbnbBookings",
  "airbnbPayouts",
  "airbnbIntegrations",
  "airbnbSettings",
  "airbnbCalendarSettings",
  "airbnbCalendar",
  "airbnbCompliance",
  "airbnbComplianceDocuments",
  "airbnbGuestVerifications",
  "airbnbSafetyChecks",
  "airbnbConversations",
  "airbnbConversationMessages",
  "airbnbMessageDeliveries",
  "airbnbMessageTemplates",
  "airbnbPricingRules",
  "airbnbPricingSettings",
  "airbnbTasks",
  "airbnbInventoryItems",
  "airbnbSmartLocks",
];

const toStringId = (value: unknown): string => {
  if (value instanceof ObjectId) return value.toString();
  return String(value ?? "");
};

export async function cascadeDeleteOwner(params: {
  db: Db;
  client: MongoClient;
  ownerId: string;
}): Promise<OwnerDeletionCounts> {
  const { db, client, ownerId } = params;
  const ownerObjectId = new ObjectId(ownerId);
  const ownerIdString = ownerObjectId.toString();
  const ownerIdMatches: Array<string | ObjectId> = [ownerIdString, ownerObjectId];

  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
  );
  const collectionsToDelete = OWNER_SCOPED_COLLECTIONS.filter((name) => existingCollections.has(name));

  const deletedCounts: OwnerDeletionCounts = {
    owner: 0,
    properties: 0,
    tenants: 0,
    invoices: 0,
    payments: 0,
  };

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const properties = await db
        .collection("properties")
        .find({ ownerId: { $in: ownerIdMatches } }, { session })
        .toArray();

      const propertyIds = properties.map((p) => p._id);
      const propertyIdStrings = propertyIds.map((id) => toStringId(id));
      const propertyIdMatches: Array<string | ObjectId> = [...propertyIds, ...propertyIdStrings];

      const tenantsRes = await db.collection("tenants").deleteMany(
        {
          $or: [
            { ownerId: { $in: ownerIdMatches } },
            { propertyId: { $in: propertyIdMatches } },
          ],
        },
        { session }
      );
      deletedCounts.tenants = tenantsRes.deletedCount;

      const invoicesRes = await db.collection("invoices").deleteMany(
        {
          $or: [
            { userId: { $in: ownerIdMatches } },
            { propertyId: { $in: propertyIdMatches } },
          ],
        },
        { session }
      );
      deletedCounts.invoices = invoicesRes.deletedCount;

      const paymentsRes = await db.collection("payments").deleteMany(
        {
          $or: [
            { userId: { $in: ownerIdMatches } },
            { ownerId: { $in: ownerIdMatches } },
            { propertyId: { $in: propertyIdMatches } },
          ],
        },
        { session }
      );
      deletedCounts.payments = paymentsRes.deletedCount;

      if (propertyIds.length > 0) {
        const propsRes = await db
          .collection("properties")
          .deleteMany({ _id: { $in: propertyIds } }, { session });
        deletedCounts.properties = propsRes.deletedCount;
      }

      for (const name of collectionsToDelete) {
        await db.collection(name).deleteMany({ ownerId: { $in: ownerIdMatches } }, { session });
      }

      const ownerRes = await db
        .collection("propertyOwners")
        .deleteOne({ _id: ownerObjectId }, { session });
      deletedCounts.owner = ownerRes.deletedCount;
    });
  } finally {
    await session.endSession();
  }

  return deletedCounts;
}

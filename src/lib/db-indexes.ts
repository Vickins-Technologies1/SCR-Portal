import "server-only";

import type { Db, IndexDescription } from "mongodb";

declare global {
  var _productionIndexesReady: Promise<void> | undefined;
}

const coreIndexes: Array<{ collection: string; indexes: IndexDescription[] }> = [
  {
    collection: "propertyOwners",
    indexes: [
      { key: { email: 1 }, name: "propertyOwners_email" },
      { key: { role: 1, isApproved: 1, createdAt: -1, _id: -1 }, name: "propertyOwners_admin_list" },
    ],
  },
  {
    collection: "users",
    indexes: [
      { key: { email: 1 }, name: "users_email" },
      { key: { role: 1, createdAt: -1 }, name: "users_role_createdAt" },
    ],
  },
  {
    collection: "teamMembers",
    indexes: [
      { key: { ownerId: 1, active: 1 }, name: "teamMembers_owner_active" },
      { key: { email: 1, ownerId: 1 }, name: "teamMembers_email_owner" },
    ],
  },
  {
    collection: "properties",
    indexes: [
      { key: { ownerId: 1, _id: 1 }, name: "properties_owner_id" },
      { key: { ownerId: 1, createdAt: -1, _id: -1 }, name: "properties_owner_createdAt" },
    ],
  },
  {
    collection: "propertyListings",
    indexes: [
      { key: { status: 1, isAdvertised: -1, createdAt: -1, _id: -1 }, name: "propertyListings_public" },
      { key: { ownerId: 1, status: 1, createdAt: -1, _id: -1 }, name: "propertyListings_owner_status" },
      { key: { originalPropertyId: 1 }, name: "propertyListings_originalPropertyId" },
    ],
  },
  {
    collection: "marketplaceSaleListings",
    indexes: [
      { key: { status: 1, isFeatured: -1, createdAt: -1, _id: -1 }, name: "marketplaceSaleListings_public" },
      { key: { ownerId: 1, status: 1, createdAt: -1, _id: -1 }, name: "marketplaceSaleListings_owner_status" },
    ],
  },
  {
    collection: "airbnbListings",
    indexes: [
      { key: { ownerId: 1, status: 1, createdAt: -1, _id: -1 }, name: "airbnbListings_owner_status" },
      { key: { status: 1, createdAt: -1, _id: -1 }, name: "airbnbListings_public" },
      { key: { externalId: 1 }, name: "airbnbListings_externalId" },
    ],
  },
  {
    collection: "tenants",
    indexes: [
      { key: { ownerId: 1, status: 1, propertyId: 1 }, name: "tenants_owner_status_property" },
      { key: { propertyId: 1, status: 1, leaseStartDate: 1, leaseEndDate: 1 }, name: "tenants_occupancy" },
      { key: { email: 1 }, name: "tenants_email" },
      { key: { phone: 1 }, name: "tenants_phone" },
    ],
  },
  {
    collection: "payments",
    indexes: [
      { key: { ownerId: 1, status: 1, createdAt: -1 }, name: "payments_owner_status_createdAt" },
      { key: { tenantId: 1, status: 1, createdAt: -1 }, name: "payments_tenant_status_createdAt" },
      { key: { invoiceId: 1 }, name: "payments_invoiceId" },
      { key: { type: 1, status: 1, ownerId: 1 }, name: "payments_type_status_owner" },
      { key: { paymentId: 1 }, name: "payments_paymentId_unique", unique: true, partialFilterExpression: { paymentId: { $type: "string" } } },
      { key: { provider: 1, checkoutRequestId: 1 }, name: "payments_daraja_checkout_unique", unique: true, partialFilterExpression: { provider: "daraja", checkoutRequestId: { $type: "string" } } },
      { key: { provider: 1, merchantRequestId: 1 }, name: "payments_daraja_merchant_unique", unique: true, partialFilterExpression: { provider: "daraja", merchantRequestId: { $type: "string" } } },
      { key: { provider: 1, mpesaCode: 1 }, name: "payments_daraja_receipt_unique", unique: true, partialFilterExpression: { provider: "daraja", mpesaCode: { $type: "string" } } },
    ],
  },
  {
    collection: "invoices",
    indexes: [
      { key: { ownerId: 1, status: 1, dueDate: 1 }, name: "invoices_owner_status_dueDate" },
      { key: { tenantId: 1, status: 1, dueDate: 1 }, name: "invoices_tenant_status_dueDate" },
      { key: { propertyId: 1, status: 1, dueDate: 1 }, name: "invoices_property_status_dueDate" },
    ],
  },
  {
    collection: "unmatchedMpesaCallbacks",
    indexes: [
      { key: { checkoutRequestId: 1 }, name: "unmatched_mpesa_checkout_unique", unique: true },
      { key: { provider: 1, transactionId: 1 }, name: "unmatched_mpesa_transaction_unique", unique: true, partialFilterExpression: { transactionId: { $type: "string" } } },
      { key: { resolved: 1, receivedAt: -1 }, name: "unmatched_mpesa_resolution" },
    ],
  },
  {
    collection: "propertyReviews",
    indexes: [
      { key: { listingId: 1, status: 1, createdAt: -1 }, name: "propertyReviews_listing_status_createdAt" },
    ],
  },
  {
    collection: "notifications",
    indexes: [
      { key: { ownerId: 1, status: 1, createdAt: -1 }, name: "notifications_owner_status_createdAt" },
      { key: { tenantId: 1, status: 1, createdAt: -1 }, name: "notifications_tenant_status_createdAt" },
    ],
  },
];

async function createCoreIndexes(db: Db) {
  await Promise.all(
    coreIndexes.map(async ({ collection, indexes }) => {
      await db.collection(collection).createIndexes(indexes);
    })
  );
}

export function ensureProductionIndexes(db: Db): Promise<void> {
  if (!global._productionIndexesReady) {
    global._productionIndexesReady = createCoreIndexes(db).catch((error) => {
      global._productionIndexesReady = undefined;
      console.error("MongoDB index bootstrap failed:", error);
    });
  }

  return global._productionIndexesReady;
}

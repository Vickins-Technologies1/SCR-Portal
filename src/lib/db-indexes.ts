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
      { key: { referralCode: 1 }, name: "propertyOwners_referralCode_unique", unique: true, partialFilterExpression: { referralCode: { $type: "string" } } },
      { key: { role: 1, isApproved: 1, createdAt: -1, _id: -1 }, name: "propertyOwners_admin_list" },
    ],
  },
  {
    collection: "referrals",
    indexes: [
      { key: { referredUserId: 1 }, name: "referrals_referred_user_unique", unique: true, partialFilterExpression: { referredUserId: { $type: "string" } } },
      { key: { referrerUserId: 1, status: 1, createdAt: -1 }, name: "referrals_referrer_status" },
      { key: { referralCode: 1, createdAt: -1 }, name: "referrals_code_createdAt" },
    ],
  },
  {
    collection: "referralCommissions",
    indexes: [
      { key: { referralId: 1 }, name: "referralCommissions_referral_unique", unique: true },
      { key: { userId: 1, status: 1, createdAt: -1 }, name: "referralCommissions_user_status" },
    ],
  },
  {
    collection: "subscriptionRewards",
    indexes: [{ key: { referralId: 1 }, name: "subscriptionRewards_referral_unique", unique: true }],
  },
  {
    collection: "rewardLedger",
    indexes: [
      { key: { userId: 1, currency: 1, status: 1, createdAt: -1 }, name: "rewardLedger_user_currency_status" },
      { key: { sourceId: 1 }, name: "rewardLedger_source_unique", unique: true, partialFilterExpression: { sourceId: { $type: "string" } } },
    ],
  },
  {
    collection: "payouts",
    indexes: [
      { key: { userId: 1, status: 1, requestedAt: -1 }, name: "payouts_user_status" },
      { key: { idempotencyKey: 1 }, name: "payouts_idempotency_unique", unique: true },
      { key: { reference: 1 }, name: "payouts_reference_unique", unique: true, partialFilterExpression: { reference: { $type: "string" } } },
      { key: { status: 1, requestedAt: -1 }, name: "payouts_status_requestedAt" },
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

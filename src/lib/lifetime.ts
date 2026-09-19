import { Db, ObjectId } from "mongodb";

export const LIFETIME_PLAN_ID = "lifetime";
export const LIFETIME_PLAN_TYPE = "lifetime";
export const LIFETIME_BILLING_TYPE = "one_time";

export const LIFETIME_FEATURE_KEYS = [
  "propertyManagement",
  "tenantManagement",
  "rentTracking",
  "paymentRecords",
  "expenses",
  "financialReports",
  "statements",
  "maintenance",
  "notifications",
  "marketplace",
  "airbnb",
  "ownerDashboard",
  "tenantPortal",
  "staffRoles",
  "dataExports",
  "documents",
] as const;

export type LifetimeFeature = (typeof LIFETIME_FEATURE_KEYS)[number];
export type LifetimeLimitKey =
  | "propertyLimit"
  | "unitLimit"
  | "tenantLimit"
  | "staffLimit"
  | "airbnbLimit"
  | "storageLimit"
  | "monthlyTransactionLimit";

export type LifetimeLimits = Record<LifetimeLimitKey, number | null>;

export type LifetimePlan = {
  _id?: string;
  name: "Lifetime";
  planType: typeof LIFETIME_PLAN_TYPE;
  billingType: typeof LIFETIME_BILLING_TYPE;
  subscriptionPeriod: "lifetime";
  price: number;
  currency: string;
  recurring: false;
  autoRenew: false;
  active: boolean;
  features: Record<LifetimeFeature, boolean>;
  limits: LifetimeLimits;
  updatedAt?: Date | string;
};

export type LifetimeStatus = "active" | "suspended" | "revoked" | "refunded" | "chargeback";

export type LifetimeEntitlement = {
  _id: ObjectId;
  ownerId: string;
  planType: typeof LIFETIME_PLAN_TYPE;
  billingType: typeof LIFETIME_BILLING_TYPE;
  status: LifetimeStatus;
  purchasedAt: Date | string;
  expiresAt: null;
  autoRenew: false;
  paymentId?: ObjectId | string;
  providerReference?: string | null;
  amountPaid: number;
  currency: string;
  limits: LifetimeLimits;
  features: Record<LifetimeFeature, boolean>;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const DEFAULT_FEATURES = Object.fromEntries(LIFETIME_FEATURE_KEYS.map((key) => [key, true])) as Record<LifetimeFeature, boolean>;

function envLimit(name: string): number | null {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return -1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && (parsed === -1 || parsed >= 0) ? parsed : -1;
}

export function defaultLifetimePlan(): LifetimePlan {
  return {
    _id: LIFETIME_PLAN_ID,
    name: "Lifetime",
    planType: LIFETIME_PLAN_TYPE,
    billingType: LIFETIME_BILLING_TYPE,
    subscriptionPeriod: "lifetime",
    price: Math.max(0, Number(process.env.LIFETIME_PRICE_KES || 0)),
    currency: String(process.env.LIFETIME_CURRENCY || "KES").trim().toUpperCase(),
    recurring: false,
    autoRenew: false,
    active: String(process.env.LIFETIME_ENABLED || "true").toLowerCase() !== "false",
    features: { ...DEFAULT_FEATURES },
    limits: {
      propertyLimit: envLimit("LIFETIME_PROPERTY_LIMIT"),
      unitLimit: envLimit("LIFETIME_UNIT_LIMIT"),
      tenantLimit: envLimit("LIFETIME_TENANT_LIMIT"),
      staffLimit: envLimit("LIFETIME_STAFF_LIMIT"),
      airbnbLimit: envLimit("LIFETIME_AIRBNB_LIMIT"),
      storageLimit: envLimit("LIFETIME_STORAGE_LIMIT"),
      monthlyTransactionLimit: envLimit("LIFETIME_MONTHLY_TRANSACTION_LIMIT"),
    },
  };
}

export function isUnlimitedLimit(limit: number | null | undefined): boolean {
  return limit == null || limit === -1;
}

export function canUseLimit(limit: number | null | undefined, current: number, additional = 1): boolean {
  return isUnlimitedLimit(limit) || current + additional <= Math.max(0, Number(limit));
}

export function formatLimit(limit: number | null | undefined): number | "Unlimited" {
  return isUnlimitedLimit(limit) ? "Unlimited" : Math.max(0, Number(limit));
}

export async function getLifetimePlan(db: Db): Promise<LifetimePlan> {
  const defaults = defaultLifetimePlan();
  const collection = db.collection<any>("planDefinitions");
  const existing = await collection.findOne({ $or: [{ _id: LIFETIME_PLAN_ID }, { planType: LIFETIME_PLAN_TYPE }] });
  if (existing) {
    return {
      ...defaults,
      ...existing,
      features: { ...defaults.features, ...(existing.features || {}) },
      limits: { ...defaults.limits, ...(existing.limits || {}) },
    } as unknown as LifetimePlan;
  }

  await collection.updateOne(
    { _id: LIFETIME_PLAN_ID },
    { $setOnInsert: { ...defaults, createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  return defaults;
}

export function publicLifetimePlan(plan: LifetimePlan) {
  return {
    id: LIFETIME_PLAN_ID,
    name: plan.name,
    type: plan.planType,
    billingType: plan.billingType,
    subscriptionPeriod: plan.subscriptionPeriod,
    price: plan.price,
    currency: plan.currency,
    recurring: false,
    autoRenew: false,
    active: plan.active,
    features: plan.features,
    limits: Object.fromEntries(Object.entries(plan.limits).map(([key, value]) => [key, formatLimit(value)])),
  };
}

export async function getActiveLifetimeEntitlement(db: Db, ownerId: string) {
  if (!ownerId) return null;
  return db.collection<LifetimeEntitlement>("entitlements").findOne({
    ownerId,
    planType: LIFETIME_PLAN_TYPE,
    billingType: LIFETIME_BILLING_TYPE,
    status: "active",
  });
}

export async function getOwnerEntitlementAccess(db: Db, ownerId: string, legacyTier?: string | null) {
  const entitlement = await getActiveLifetimeEntitlement(db, ownerId);
  if (entitlement) {
    return {
      plan: "lifetime" as const,
      billingType: LIFETIME_BILLING_TYPE,
      status: entitlement.status,
      features: entitlement.features,
      limits: entitlement.limits,
      entitlement,
    };
  }

  const isPremium = String(legacyTier || "premium").toLowerCase() !== "free";
  return {
    plan: isPremium ? "premium" as const : "free" as const,
    billingType: isPremium ? "recurring" : "none",
    status: "active",
    features: Object.fromEntries(LIFETIME_FEATURE_KEYS.map((key) => [key, isPremium])) as Record<LifetimeFeature, boolean>,
    limits: {
      propertyLimit: isPremium ? -1 : 1,
      unitLimit: -1,
      tenantLimit: -1,
      staffLimit: isPremium ? -1 : 0,
      airbnbLimit: isPremium ? -1 : 0,
      storageLimit: -1,
      monthlyTransactionLimit: -1,
    } satisfies LifetimeLimits,
    entitlement: null,
  };
}

export async function hasFeature(db: Db, ownerId: string, feature: LifetimeFeature, legacyTier?: string | null) {
  const access = await getOwnerEntitlementAccess(db, ownerId, legacyTier);
  return access.features[feature] === true;
}

export async function getPlanLimits(db: Db, ownerId: string, legacyTier?: string | null) {
  return (await getOwnerEntitlementAccess(db, ownerId, legacyTier)).limits;
}

export async function enforceLifetimeLimit(params: {
  db: Db;
  ownerId: string;
  key: LifetimeLimitKey;
  current: number;
  additional?: number;
}) {
  const access = await getOwnerEntitlementAccess(params.db, params.ownerId);
  const limit = access.limits[params.key];
  const additional = params.additional ?? 1;
  if (canUseLimit(limit, params.current, additional)) return { allowed: true as const, limit, plan: access.plan };
  return { allowed: false as const, limit, plan: access.plan };
}

export async function activateLifetimeFromVerifiedPayment(params: {
  db: Db;
  paymentId: ObjectId;
  providerReference?: string | null;
  purchasedAt?: Date;
}) {
  const { db, paymentId } = params;
  const payment = await db.collection("payments").findOne({ _id: paymentId });
  if (!payment || payment.planType !== LIFETIME_PLAN_TYPE || payment.billingType !== LIFETIME_BILLING_TYPE) return null;
  if (!['completed', 'paid'].includes(String(payment.status).toLowerCase())) return null;
  if (payment.verificationStatus === "rejected") return null;

  const ownerId = String(payment.ownerId || payment.userId || "");
  if (!ObjectId.isValid(ownerId)) return null;
  const plan = await getLifetimePlan(db);
  if (!plan.active || plan.price <= 0 || Number(payment.amount) !== Number(plan.price)) {
    await db.collection("payments").updateOne({ _id: paymentId }, { $set: { verificationStatus: "rejected", updatedAt: new Date() } });
    return null;
  }

  const now = params.purchasedAt ?? new Date();
  const existing = await getActiveLifetimeEntitlement(db, ownerId);
  if (existing) {
    await db.collection("payments").updateOne({ _id: paymentId }, { $set: { verificationStatus: "verified", entitlementId: existing._id, updatedAt: new Date() } });
    return existing;
  }

  const entitlementData = {
    ownerId,
    planType: LIFETIME_PLAN_TYPE,
    billingType: LIFETIME_BILLING_TYPE,
    status: "active" as const,
    purchasedAt: now,
    expiresAt: null,
    autoRenew: false,
    paymentId,
    providerReference: params.providerReference || payment.mpesaCode || payment.providerReference || null,
    amountPaid: Number(payment.amount),
    currency: plan.currency,
    limits: plan.limits,
    features: plan.features,
    createdAt: now,
    updatedAt: now,
  };

  let entitlement;
  try {
    const result = await db.collection("entitlements").insertOne(entitlementData);
    entitlement = { ...entitlementData, _id: result.insertedId } as LifetimeEntitlement;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    entitlement = await getActiveLifetimeEntitlement(db, ownerId);
    if (!entitlement) throw error;
  }

  await db.collection("payments").updateOne(
    { _id: paymentId },
    {
      $set: {
        status: "paid",
        verificationStatus: "verified",
        paidAt: now,
        providerReference: params.providerReference || payment.mpesaCode || payment.providerReference || null,
        entitlementId: entitlement._id,
        updatedAt: now,
      },
    },
  );
  await db.collection("propertyOwners").updateOne(
    { _id: new ObjectId(ownerId) },
    { $set: { tier: "premium", lifetimeEntitlementId: entitlement._id, updatedAt: now } },
  );
  await db.collection("auditLogs").insertOne({
    action: "lifetime_entitlement_activated",
    ownerId,
    entitlementId: entitlement._id,
    paymentId,
    timestamp: now.toISOString(),
  });
  return entitlement;
}

export function lifetimePaymentQuery(ownerId: string) {
  return { ownerId, planType: LIFETIME_PLAN_TYPE, billingType: LIFETIME_BILLING_TYPE };
}

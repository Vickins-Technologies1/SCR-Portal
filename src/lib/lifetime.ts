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

export type LifetimePricingTier = {
  id?: string;
  minUnits: number;
  maxUnits: number | null;
  price: number;
  currency: string;
  active: boolean;
};

export type LifetimePricingConfig = {
  minimumUnits: number;
  maximumUnits: number | null;
  currency: string;
  tiers: LifetimePricingTier[];
  effectiveFrom?: Date | string | null;
};

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
  minimumUnits: number;
  maximumUnits: number | null;
  pricingTiers: LifetimePricingTier[];
  updatedAt?: Date | string;
};

export type LifetimePriceQuote = {
  units: number;
  tier: { minUnits: number; maxUnits: number | null; price: number; currency: string };
  amount: number;
  currency: string;
};

export class LifetimePricingError extends Error {
  code: "INVALID_UNITS" | "NO_PRICE" | "INVALID_CONFIGURATION";

  constructor(message: string, code: LifetimePricingError["code"]) {
    super(message);
    this.name = "LifetimePricingError";
    this.code = code;
  }
}

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
  purchasedUnits?: number;
  pricingSnapshot?: LifetimePriceQuote | null;
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
    // Kept for compatibility with older records. New Lifetime purchases use
    // pricingTiers and never use this flat value.
    price: 0,
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
    minimumUnits: Math.max(1, Number(process.env.LIFETIME_MINIMUM_UNITS || 1)),
    maximumUnits: process.env.LIFETIME_MAXIMUM_UNITS ? Math.max(1, Number(process.env.LIFETIME_MAXIMUM_UNITS)) : null,
    pricingTiers: [],
  };
}

function validCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

function normalizeTier(tier: Partial<LifetimePricingTier>, fallbackCurrency: string): LifetimePricingTier {
  const maxUnits = (tier.maxUnits as unknown) === "" || tier.maxUnits === undefined ? null : tier.maxUnits;
  return {
    id: typeof tier.id === "string" && tier.id.trim() ? tier.id : undefined,
    minUnits: Number(tier.minUnits),
    maxUnits: maxUnits === null ? null : Number(maxUnits),
    price: Number(tier.price),
    currency: tier.currency === undefined ? fallbackCurrency : String(tier.currency).trim().toUpperCase(),
    active: tier.active !== false,
  };
}

export function validateLifetimePricing(config: {
  minimumUnits: unknown;
  maximumUnits: unknown;
  currency: unknown;
  tiers: unknown;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const minimumUnits = Number(config.minimumUnits);
  const maximumUnits = config.maximumUnits === null || config.maximumUnits === undefined || config.maximumUnits === "" ? null : Number(config.maximumUnits);
  const currency = typeof config.currency === "string" ? config.currency.trim().toUpperCase() : "";
  const tiers = Array.isArray(config.tiers) ? config.tiers.map((tier) => normalizeTier(tier as Partial<LifetimePricingTier>, currency)) : [];

  if (!Number.isInteger(minimumUnits) || minimumUnits < 0) errors.push("Minimum units must be a whole number of 0 or more.");
  if (maximumUnits !== null && (!Number.isInteger(maximumUnits) || maximumUnits <= 0)) errors.push("Maximum units must be empty or a whole number greater than 0.");
  if (maximumUnits !== null && Number.isInteger(minimumUnits) && maximumUnits < minimumUnits) errors.push("Maximum units cannot be smaller than minimum units.");
  if (!validCurrency(currency)) errors.push("Currency must be a valid three-letter currency code.");
  if (tiers.length === 0) errors.push("Add at least one pricing tier.");

  for (const [index, tier] of tiers.entries()) {
    if (!Number.isInteger(tier.minUnits) || tier.minUnits < 0) errors.push(`Tier ${index + 1}: minimum units must be a whole number of 0 or more.`);
    if (tier.maxUnits !== null && (!Number.isInteger(tier.maxUnits) || tier.maxUnits <= 0)) errors.push(`Tier ${index + 1}: maximum units must be empty or greater than 0.`);
    if (tier.maxUnits !== null && Number.isInteger(tier.minUnits) && tier.maxUnits < tier.minUnits) errors.push(`Tier ${index + 1}: maximum units cannot be smaller than minimum units.`);
    if (!Number.isSafeInteger(tier.price) || tier.price < 0) errors.push(`Tier ${index + 1}: price must be a non-negative whole amount.`);
    if (!validCurrency(tier.currency)) errors.push(`Tier ${index + 1}: currency must be a valid three-letter code.`);
  }

  const activeTiers = tiers.filter((tier) => tier.active).sort((a, b) => a.minUnits - b.minUnits || (a.maxUnits ?? Number.MAX_SAFE_INTEGER) - (b.maxUnits ?? Number.MAX_SAFE_INTEGER));
  for (let index = 1; index < activeTiers.length; index += 1) {
    const previous = activeTiers[index - 1];
    const current = activeTiers[index];
    if (previous.maxUnits === null || current.minUnits <= previous.maxUnits) errors.push(`Active pricing tiers overlap around ${current.minUnits} units.`);
  }

  if (activeTiers.length > 0 && Number.isInteger(minimumUnits)) {
    if (activeTiers[0].minUnits > minimumUnits) warnings.push(`Pricing configuration has a gap between ${minimumUnits} and ${activeTiers[0].minUnits} units.`);
    for (let index = 1; index < activeTiers.length; index += 1) {
      const previous = activeTiers[index - 1];
      const current = activeTiers[index];
      if (previous.maxUnits !== null && current.minUnits > previous.maxUnits + 1) warnings.push(`Pricing configuration has a gap between ${previous.maxUnits} and ${current.minUnits} units.`);
    }
    const last = activeTiers[activeTiers.length - 1];
    if (maximumUnits !== null && last.maxUnits !== null && last.maxUnits < maximumUnits) warnings.push(`Pricing configuration has a gap between ${last.maxUnits} and ${maximumUnits} units.`);
    if (maximumUnits === null && last.maxUnits !== null) warnings.push(`Pricing configuration has no open-ended tier after ${last.maxUnits} units.`);
  }

  return { errors, warnings, minimumUnits, maximumUnits, currency, tiers };
}

export function calculateLifetimePriceFromPlan(plan: LifetimePlan, unitsInput: unknown): LifetimePriceQuote {
  if (typeof unitsInput !== "number" || !Number.isSafeInteger(unitsInput) || unitsInput < plan.minimumUnits) {
    throw new LifetimePricingError(`Enter at least ${plan.minimumUnits} whole unit${plan.minimumUnits === 1 ? "" : "s"}.`, "INVALID_UNITS");
  }
  if (plan.maximumUnits !== null && unitsInput > plan.maximumUnits) {
    throw new LifetimePricingError(`For properties above ${plan.maximumUnits} units, please contact Sorana for a custom Lifetime package.`, "NO_PRICE");
  }
  const tier = plan.pricingTiers.find((candidate) => candidate.active && candidate.minUnits <= unitsInput && (candidate.maxUnits === null || unitsInput <= candidate.maxUnits));
  if (!tier) throw new LifetimePricingError(`No Lifetime pricing is configured for ${unitsInput} units. Please contact Sorana.`, "NO_PRICE");
  return {
    units: unitsInput,
    tier: { minUnits: tier.minUnits, maxUnits: tier.maxUnits, price: tier.price, currency: tier.currency },
    amount: tier.price,
    currency: tier.currency,
  };
}

export async function calculateLifetimePrice(db: Db, unitsInput: unknown) {
  return calculateLifetimePriceFromPlan(await getLifetimePlan(db), unitsInput);
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
      minimumUnits: Number.isInteger(existing.minimumUnits) ? existing.minimumUnits : defaults.minimumUnits,
      maximumUnits: existing.maximumUnits === null || Number.isInteger(existing.maximumUnits) ? existing.maximumUnits : defaults.maximumUnits,
      pricingTiers: Array.isArray(existing.pricingTiers) ? existing.pricingTiers.map((tier: Partial<LifetimePricingTier>) => normalizeTier(tier, existing.currency || defaults.currency)) : defaults.pricingTiers,
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
    currency: plan.currency,
    recurring: false,
    autoRenew: false,
    active: plan.active,
    features: plan.features,
    limits: Object.fromEntries(Object.entries(plan.limits).map(([key, value]) => [key, formatLimit(value)])),
    pricing: {
      minimumUnits: plan.minimumUnits,
      maximumUnits: plan.maximumUnits,
      currency: plan.currency,
      tiers: plan.pricingTiers,
      warnings: validateLifetimePricing({ minimumUnits: plan.minimumUnits, maximumUnits: plan.maximumUnits, currency: plan.currency, tiers: plan.pricingTiers }).warnings,
    },
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
  const snapshot = payment.pricingSnapshot as LifetimePriceQuote | undefined;
  const purchasedUnits = Number(payment.purchasedUnits || snapshot?.units || 0);
  const hasPurchasedUnits = Number.isSafeInteger(purchasedUnits) && purchasedUnits > 0;
  const expectedAmount = Number(snapshot?.amount || payment.amount);
  const legacyPaymentIsValid = !snapshot && plan.active && plan.price > 0 && Number(payment.amount) === Number(plan.price);
  if ((snapshot && (!hasPurchasedUnits || Number(payment.amount) !== expectedAmount)) || (!snapshot && !legacyPaymentIsValid)) {
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
    currency: snapshot?.currency || payment.currency || plan.currency,
    limits: { ...plan.limits, ...(hasPurchasedUnits ? { unitLimit: purchasedUnits } : {}) },
    features: plan.features,
    purchasedUnits,
    pricingSnapshot: snapshot || null,
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
        purchasedUnits,
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

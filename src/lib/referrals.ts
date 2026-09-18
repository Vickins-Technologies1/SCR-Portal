import { Db, ObjectId } from "mongodb";

export type ReferralRewardMode = "subscription_credit" | "cash_commission" | "cash_and_subscription";
export type ReferralStatus = "clicked" | "registered" | "pending" | "qualified" | "rewarded" | "rejected" | "cancelled";
export type CommissionStatus = "pending" | "available" | "locked" | "paid" | "reversed" | "cancelled";
export type PayoutStatus = "requested" | "processing" | "paid" | "failed" | "cancelled" | "reversed";

export type ReferralSettings = {
  attributionDays: number;
  subscriptionRewardMonths: number;
  cashCommissionAmount: number;
  minimumPayoutAmount: number;
  requirePaidSubscription: boolean;
  currency: "KES";
};

const DEFAULT_SETTINGS: ReferralSettings = {
  attributionDays: 30,
  subscriptionRewardMonths: 1,
  cashCommissionAmount: 500,
  minimumPayoutAmount: 1000,
  requirePaidSubscription: true,
  currency: "KES",
};

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getEnvironmentReferralSettings(): ReferralSettings {
  return {
    ...DEFAULT_SETTINGS,
    attributionDays: positiveInteger(process.env.REFERRAL_ATTRIBUTION_DAYS, DEFAULT_SETTINGS.attributionDays),
    subscriptionRewardMonths: positiveInteger(process.env.REFERRAL_SUBSCRIPTION_REWARD_MONTHS, DEFAULT_SETTINGS.subscriptionRewardMonths),
    cashCommissionAmount: positiveInteger(process.env.REFERRAL_CASH_COMMISSION_AMOUNT, DEFAULT_SETTINGS.cashCommissionAmount),
    minimumPayoutAmount: positiveInteger(process.env.REFERRAL_MINIMUM_PAYOUT, DEFAULT_SETTINGS.minimumPayoutAmount),
    requirePaidSubscription: process.env.REFERRAL_REQUIRE_PAID_SUBSCRIPTION !== "false",
  };
}

export async function getReferralSettings(db: Db): Promise<ReferralSettings> {
  const envSettings = getEnvironmentReferralSettings();
  const stored = await db.collection("referralSettings").findOne({ _id: "default" as never });
  if (!stored) return envSettings;

  return {
    ...envSettings,
    attributionDays: positiveInteger(stored.attributionDays, envSettings.attributionDays),
    subscriptionRewardMonths: positiveInteger(stored.subscriptionRewardMonths, envSettings.subscriptionRewardMonths),
    cashCommissionAmount: positiveInteger(stored.cashCommissionAmount, envSettings.cashCommissionAmount),
    minimumPayoutAmount: positiveInteger(stored.minimumPayoutAmount, envSettings.minimumPayoutAmount),
    requirePaidSubscription: stored.requirePaidSubscription !== false,
  };
}

export function normalizeRewardMode(value: unknown): ReferralRewardMode {
  if (value === "cash_commission" || value === "cash_and_subscription") return value;
  return "subscription_credit";
}

export function isValidReferralCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9-]{6,48}$/.test(value);
}

async function generateUniqueReferralCode(db: Db, name?: string): Promise<string> {
  const namePart = (name || "USER")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12) || "USER";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const candidate = `SORANA-${namePart}-${suffix}`;
    const exists = await db.collection("propertyOwners").findOne({ referralCode: candidate }, { projection: { _id: 1 } });
    if (!exists) return candidate;
  }

  return `SORANA-${new ObjectId().toString().slice(-10).toUpperCase()}`;
}

export async function ensureReferralProfile(db: Db, userId: string, name?: string, rewardMode?: ReferralRewardMode) {
  if (!ObjectId.isValid(userId)) throw new Error("Invalid user id");
  const ownerId = new ObjectId(userId);
  const owner = await db.collection("propertyOwners").findOne({ _id: ownerId }, { projection: { name: 1, referralCode: 1, referralRewardMode: 1 } });
  if (!owner) throw new Error("Referral participant not found");

  const updates: Record<string, unknown> = {
    referralRewardMode: normalizeRewardMode(rewardMode || owner.referralRewardMode),
    referralProgramActive: true,
    updatedAt: new Date(),
  };
  if (!owner.referralCode || !isValidReferralCode(owner.referralCode)) {
    updates.referralCode = await generateUniqueReferralCode(db, name || owner.name);
  }

  await db.collection("propertyOwners").updateOne({ _id: ownerId }, { $set: updates });
  return {
    referralCode: String(updates.referralCode || owner.referralCode),
    rewardMode: updates.referralRewardMode as ReferralRewardMode,
  };
}

export async function createReferralAttribution(params: {
  db: Db;
  referredUserId: string;
  referralCode?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
}) {
  const { db, referredUserId, referralCode } = params;
  if (!referralCode || !isValidReferralCode(referralCode) || !ObjectId.isValid(referredUserId)) return null;

  const referrer = await db.collection("propertyOwners").findOne({ referralCode }, { projection: { _id: 1, referralRewardMode: 1 } });
  if (!referrer || referrer._id.toString() === referredUserId) return null;

  const existing = await db.collection("referrals").findOne({ referredUserId, status: { $nin: ["rejected", "cancelled"] } });
  if (existing) return existing;

  const now = new Date();
  const referral = {
    referrerUserId: referrer._id.toString(),
    referredUserId,
    referralCode,
    status: "registered" as ReferralStatus,
    rewardMode: normalizeRewardMode(referrer.referralRewardMode),
    qualifyingEvent: "paid_subscription",
    attribution: {
      method: "referral_cookie",
      ipHash: params.ipHash || undefined,
      userAgent: params.userAgent || undefined,
      registeredAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  try {
    const inserted = await db.collection("referrals").insertOne(referral);
    return { ...referral, _id: inserted.insertedId };
  } catch (error: any) {
    if (error?.code === 11000) return db.collection("referrals").findOne({ referredUserId });
    throw error;
  }
}

export async function qualifyReferralForUser(params: {
  db: Db;
  referredUserId: string;
  eventId: string;
  eventType?: string;
}) {
  const { db, referredUserId, eventId } = params;
  const settings = await getReferralSettings(db);
  const referral = await db.collection("referrals").findOne({ referredUserId, status: { $in: ["registered", "pending"] } });
  if (!referral) return { qualified: false, reason: "not_eligible" as const };

  const now = new Date();
  const claimed = await db.collection("referrals").updateOne(
    { _id: referral._id, status: { $in: ["registered", "pending"] } },
    { $set: { status: "qualified", qualifyingEvent: params.eventType || "paid_subscription", qualifyingEventId: eventId, qualifiedAt: now, updatedAt: now } }
  );
  if (!claimed.modifiedCount) return { qualified: false, reason: "already_processed" as const };

  const rewardMode = normalizeRewardMode(referral.rewardMode);
  const rewards: { commissionId?: string; subscriptionMonths?: number } = {};
  if (rewardMode === "cash_commission" || rewardMode === "cash_and_subscription") {
    const commission = {
      userId: referral.referrerUserId,
      referralId: referral._id.toString(),
      amount: settings.cashCommissionAmount,
      currency: settings.currency,
      status: "available" as CommissionStatus,
      earnedAt: now,
      availableAt: now,
      sourceEventId: eventId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const result = await db.collection("referralCommissions").insertOne(commission);
      rewards.commissionId = result.insertedId.toString();
      await db.collection("rewardLedger").updateOne(
        { sourceId: `commission:${referral._id.toString()}` },
        {
          $setOnInsert: {
            userId: referral.referrerUserId,
            type: "referral_commission",
            sourceId: `commission:${referral._id.toString()}`,
            amount: settings.cashCommissionAmount,
            currency: settings.currency,
            direction: "credit",
            status: "posted",
            description: "Referral commission",
            createdAt: now,
          },
        },
        { upsert: true }
      );
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }

  if (rewardMode === "subscription_credit" || rewardMode === "cash_and_subscription") {
    await db.collection("subscriptionRewards").updateOne(
      { referralId: referral._id.toString() },
      {
        $setOnInsert: {
          userId: referral.referrerUserId,
          referralId: referral._id.toString(),
          months: settings.subscriptionRewardMonths,
          status: "available",
          createdAt: now,
        },
      },
      { upsert: true }
    );
    rewards.subscriptionMonths = settings.subscriptionRewardMonths;
    await db.collection("rewardLedger").updateOne(
      { sourceId: `subscription:${referral._id.toString()}` },
      {
        $setOnInsert: {
          userId: referral.referrerUserId,
          type: "subscription_credit",
          sourceId: `subscription:${referral._id.toString()}`,
          amount: settings.subscriptionRewardMonths,
          currency: "MONTHS",
          direction: "credit",
          status: "posted",
          description: "Sorana subscription credit",
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  await db.collection("referrals").updateOne(
    { _id: referral._id },
    { $set: { status: "rewarded", rewardedAt: now, updatedAt: now } }
  );
  return { qualified: true, rewards };
}

export async function getReferralWallet(db: Db, userId: string) {
  const [commissionTotals, pendingTotals, ledgerTotals, payoutTotals] = await Promise.all([
    db.collection("referralCommissions").aggregate([{ $match: { userId } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
    db.collection("referralCommissions").aggregate([{ $match: { userId, status: "pending" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
    db.collection("rewardLedger").aggregate([
      { $match: { userId, currency: "KES", status: { $in: ["posted", "reserved"] } } },
      { $group: { _id: "$direction", total: { $sum: "$amount" } } },
    ]).toArray(),
    db.collection("payouts").aggregate([{ $match: { userId, status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
  ]);

  const credits = Number(ledgerTotals.find((row: any) => row._id === "credit")?.total || 0);
  const debits = Number(ledgerTotals.find((row: any) => row._id === "debit")?.total || 0);
  return {
    totalEarned: Number(commissionTotals[0]?.total || 0),
    available: Math.max(0, credits - debits),
    pending: Number(pendingTotals[0]?.total || 0),
    paidOut: Number(payoutTotals[0]?.total || 0),
  };
}

export function maskPayoutDestination(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length <= 4) return "••••";
  return `${normalized.slice(0, 2)}${"*".repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-2)}`;
}

export async function reservePayout(params: {
  db: Db;
  userId: string;
  amount: number;
  method: string;
  destination: string;
  idempotencyKey: string;
}) {
  const { db, userId, amount, method, destination, idempotencyKey } = params;
  const settings = await getReferralSettings(db);
  if (!Number.isInteger(amount) || amount < settings.minimumPayoutAmount) {
    throw new Error(`Minimum payout is KSh ${settings.minimumPayoutAmount.toLocaleString("en-KE")}`);
  }

  const existing = await db.collection("payouts").findOne({ userId, idempotencyKey });
  if (existing) return existing;
  const duplicatePending = await db.collection("payouts").findOne({ userId, status: { $in: ["requested", "processing"] } });
  if (duplicatePending) throw new Error("You already have a payout being processed.");

  const wallet = await getReferralWallet(db, userId);
  if (amount > wallet.available) throw new Error("Payout amount exceeds your available balance.");

  const now = new Date();
  let payout;
  try {
    const result = await db.collection("payouts").insertOne({
      userId,
      amount,
      currency: "KES",
      method,
      destination,
      destinationMasked: maskPayoutDestination(destination),
      status: "requested" as PayoutStatus,
      idempotencyKey,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    payout = { _id: result.insertedId, amount, currency: "KES", method, destinationMasked: maskPayoutDestination(destination), status: "requested" as PayoutStatus, requestedAt: now, idempotencyKey };
  } catch (error: any) {
    if (error?.code === 11000) {
      const duplicate = await db.collection("payouts").findOne({ userId, idempotencyKey });
      if (duplicate) return duplicate;
    }
    throw error;
  }

  try {
    await db.collection("rewardLedger").insertOne({
      userId,
      type: "payout_reservation",
      sourceId: `payout:${payout._id.toString()}`,
      amount,
      currency: "KES",
      direction: "debit",
      status: "reserved",
      description: "Referral payout reservation",
      createdAt: now,
    });
  } catch (error) {
    await db.collection("payouts").updateOne({ _id: payout._id }, { $set: { status: "failed", failureReason: "Could not reserve funds", updatedAt: new Date() } });
    throw error;
  }

  await db.collection("auditLogs").insertOne({ action: "referral_payout_requested", userId, payoutId: payout._id.toString(), amount, method, timestamp: now.toISOString() });
  return payout;
}

export async function updatePayoutStatus(params: { db: Db; payoutId: string; status: PayoutStatus; adminUserId: string; reference?: string; failureReason?: string }) {
  const { db, payoutId, status, adminUserId } = params;
  if (!ObjectId.isValid(payoutId)) throw new Error("Invalid payout id");
  const payout = await db.collection("payouts").findOne({ _id: new ObjectId(payoutId) });
  if (!payout) throw new Error("Payout not found");
  if (["paid", "failed", "cancelled", "reversed"].includes(payout.status) && payout.status !== status) throw new Error("Payout is already finalized.");

  const now = new Date();
  await db.collection("payouts").updateOne(
    { _id: payout._id },
    { $set: { status, reference: params.reference || payout.reference, failureReason: params.failureReason || payout.failureReason, processedAt: now, paidAt: status === "paid" ? now : payout.paidAt, updatedAt: now } }
  );

  const reservationSource = `payout:${payout._id.toString()}`;
  if (status === "paid") {
    await db.collection("rewardLedger").updateOne({ sourceId: reservationSource, status: "reserved" }, { $set: { status: "posted", paidAt: now } });
  } else if (["failed", "cancelled", "reversed"].includes(status)) {
    const reservation = await db.collection("rewardLedger").findOne({ sourceId: reservationSource, status: "reserved" });
    if (reservation) {
      await db.collection("rewardLedger").updateOne({ _id: reservation._id }, { $set: { status: "reversed", reversedAt: now } });
      await db.collection("rewardLedger").updateOne(
        { sourceId: `payout-reversal:${payout._id.toString()}` },
        { $setOnInsert: { userId: payout.userId, type: "payout_reversal", sourceId: `payout-reversal:${payout._id.toString()}`, amount: payout.amount, currency: "KES", direction: "credit", status: "posted", description: "Payout reservation released", createdAt: now } },
        { upsert: true }
      );
    }
  }

  await db.collection("auditLogs").insertOne({ action: "referral_payout_status_changed", adminUserId, payoutId, status, timestamp: now.toISOString(), reference: params.reference, failureReason: params.failureReason });
  return db.collection("payouts").findOne({ _id: payout._id });
}

export async function reverseReferralReward(params: { db: Db; referralId: string; adminUserId: string; reason?: string }) {
  const { db, referralId, adminUserId } = params;
  if (!ObjectId.isValid(referralId)) throw new Error("Invalid referral id");
  const referral = await db.collection("referrals").findOne({ _id: new ObjectId(referralId) });
  if (!referral) throw new Error("Referral not found");
  const now = new Date();

  const commission = await db.collection("referralCommissions").findOne({ referralId });
  if (commission && commission.status !== "reversed") {
    await db.collection("referralCommissions").updateOne({ _id: commission._id }, { $set: { status: "reversed", reversedAt: now, reversalReason: params.reason || "Qualifying payment reversed", updatedAt: now } });
    await db.collection("rewardLedger").updateOne(
      { sourceId: `commission-reversal:${referralId}` },
      { $setOnInsert: { userId: commission.userId, type: "commission_reversal", sourceId: `commission-reversal:${referralId}`, amount: commission.amount, currency: "KES", direction: "debit", status: "posted", description: params.reason || "Referral commission reversal", createdAt: now } },
      { upsert: true }
    );
  }

  const subscriptionReward = await db.collection("subscriptionRewards").findOne({ referralId });
  if (subscriptionReward && subscriptionReward.status !== "reversed") {
    await db.collection("subscriptionRewards").updateOne({ _id: subscriptionReward._id }, { $set: { status: "reversed", reversedAt: now, updatedAt: now } });
    await db.collection("rewardLedger").updateOne(
      { sourceId: `subscription-reversal:${referralId}` },
      { $setOnInsert: { userId: subscriptionReward.userId, type: "subscription_credit_reversal", sourceId: `subscription-reversal:${referralId}`, amount: subscriptionReward.months, currency: "MONTHS", direction: "debit", status: "posted", description: params.reason || "Subscription reward reversal", createdAt: now } },
      { upsert: true }
    );
  }

  await db.collection("referrals").updateOne({ _id: referral._id }, { $set: { status: "rejected", reversedAt: now, reversalReason: params.reason, updatedAt: now } });
  await db.collection("auditLogs").insertOne({ action: "referral_reward_reversed", adminUserId, referralId, reason: params.reason, timestamp: now.toISOString() });
  return db.collection("referrals").findOne({ _id: referral._id });
}

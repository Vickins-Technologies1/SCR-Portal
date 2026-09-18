import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { verifySessionToken } from "@/lib/session";
import { ensureReferralProfile, getReferralSettings, getReferralWallet, normalizeRewardMode, reservePayout } from "@/lib/referrals";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

async function getOwnerId(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session?.sub || session.role !== "propertyOwner" || !ObjectId.isValid(session.sub)) return null;
  return session.sub;
}

function serialize(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function publicPayout(value: any) {
  const safe = { ...(serialize(value) || {}) };
  delete safe.destination;
  return safe;
}

export async function GET(request: NextRequest) {
  const userId = await getOwnerId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });

  const { db } = await connectToDatabase();
  const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) }, { projection: { name: 1, referralCode: 1, referralRewardMode: 1 } });
  if (!owner) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
  const profile = await ensureReferralProfile(db, userId, owner.name, normalizeRewardMode(owner.referralRewardMode));
  const [settings, wallet, referrals, payouts] = await Promise.all([
    getReferralSettings(db),
    getReferralWallet(db, userId),
    db.collection("referrals").find({ referrerUserId: userId }).sort({ createdAt: -1 }).limit(100).toArray(),
    db.collection("payouts").find({ userId }).sort({ requestedAt: -1 }).limit(50).project({ destination: 0 }).toArray(),
  ]);

  const referredIds = referrals.map((referral) => referral.referredUserId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const referredUsers = await db.collection("propertyOwners").find({ _id: { $in: referredIds } }, { projection: { name: 1, email: 1 } }).toArray();
  const referredMap = new Map(referredUsers.map((user) => [user._id.toString(), user]));
  const commissionRows = await db.collection("referralCommissions").find({ userId }).toArray();
  const commissionMap = new Map(commissionRows.map((row) => [row.referralId, row]));
  const subscriptionRows = await db.collection("subscriptionRewards").find({ userId }).toArray();
  const subscriptionMap = new Map(subscriptionRows.map((row) => [row.referralId, row]));
  const stats = {
    total: referrals.length,
    registered: referrals.filter((referral) => referral.status === "registered").length,
    qualified: referrals.filter((referral) => ["qualified", "rewarded"].includes(referral.status)).length,
    pending: referrals.filter((referral) => ["clicked", "registered", "pending"].includes(referral.status)).length,
  };

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    success: true,
    profile: { ...profile, referralLink: `${origin}/ref/${profile.referralCode}` },
    rewardMode: profile.rewardMode,
    settings: { minimumPayoutAmount: settings.minimumPayoutAmount, subscriptionRewardMonths: settings.subscriptionRewardMonths, cashCommissionAmount: settings.cashCommissionAmount },
    stats,
    wallet,
    referrals: referrals.map((referral) => ({
      ...serialize(referral),
      referredUser: referredMap.get(referral.referredUserId)?.name || "Sorana customer",
      commission: serialize(commissionMap.get(referral._id.toString()) || null),
      subscriptionReward: serialize(subscriptionMap.get(referral._id.toString()) || null),
    })),
    payouts: payouts.map(publicPayout),
  });
}

export async function POST(request: NextRequest) {
  const userId = await getOwnerId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken : request.headers.get("x-csrf-token");
  if (!csrfToken || !validateCsrfToken(request, csrfToken)) return buildInvalidCsrfResponse(request);

  const amount = Number(body.amount);
  const method = typeof body.method === "string" ? body.method.trim() : "";
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!Number.isInteger(amount) || amount <= 0 || !method || !destination || !idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ success: false, message: "Valid payout amount, method, destination, and idempotency key are required." }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const payout = await reservePayout({ db, userId, amount, method, destination, idempotencyKey });
    return NextResponse.json({ success: true, payout: publicPayout(payout) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to create payout" }, { status: 400 });
  }
}

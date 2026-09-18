import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { getReferralSettings } from "@/lib/referrals";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:referrals:view");
  if (auth instanceof NextResponse) return auth;
  const { db } = await connectToDatabase();
  const [settings, referrals, payouts, commissionTotals] = await Promise.all([
    getReferralSettings(db),
    db.collection("referrals").find({}).sort({ createdAt: -1 }).limit(250).toArray(),
    db.collection("payouts").find({}).sort({ requestedAt: -1 }).limit(250).project({ destination: 0 }).toArray(),
    db.collection("referralCommissions").aggregate([{ $group: { _id: "$status", amount: { $sum: "$amount" }, count: { $sum: 1 } } }]).toArray(),
  ]);
  const userIds = Array.from(new Set([...referrals.map((item) => item.referrerUserId), ...payouts.map((item) => item.userId)].filter(Boolean)));
  const users = await db.collection("propertyOwners").find({ _id: { $in: userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } }, { projection: { name: 1, email: 1 } }).toArray();
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));
  return NextResponse.json({ success: true, settings, referrals: referrals.map((item) => ({ ...item, referrer: userMap.get(item.referrerUserId) })), payouts: payouts.map((item) => ({ ...item, user: userMap.get(item.userId) })), commissionTotals });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:referrals:manage");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const allowed = ["attributionDays", "subscriptionRewardMonths", "cashCommissionAmount", "minimumPayoutAmount", "requirePaidSubscription"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) update[key] = body[key];
  if (Object.keys(update).length === 0) return NextResponse.json({ success: false, message: "No settings supplied" }, { status: 400 });
  const { db } = await connectToDatabase();
  await db.collection("referralSettings").updateOne({ _id: "default" as never }, { $set: { ...update, updatedAt: new Date(), updatedBy: auth.userId } }, { upsert: true });
  await db.collection("auditLogs").insertOne({ action: "referral_settings_updated", adminUserId: auth.userId, changes: update, timestamp: new Date().toISOString() });
  return NextResponse.json({ success: true, settings: await getReferralSettings(db) });
}

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { defaultLifetimePlan, getLifetimePlan, publicLifetimePlan } from "@/lib/lifetime";
import logger from "@/lib/logger";

function serialize(value: any) {
  return { ...value, _id: value?._id?.toString?.() || value?._id };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:view");
  if (auth instanceof NextResponse) return auth;
  const { db } = await connectToDatabase();
  const plan = await getLifetimePlan(db);
  const [entitlements, transactions, revenue] = await Promise.all([
    db.collection("entitlements").find({ planType: "lifetime" }).sort({ purchasedAt: -1 }).limit(500).toArray(),
    db.collection("payments").find({ planType: "lifetime" }).sort({ createdAt: -1 }).limit(500).toArray(),
    db.collection("payments").aggregate([
      { $match: { planType: "lifetime" } },
      { $group: { _id: "$status", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const ownerIds = Array.from(new Set([...entitlements, ...transactions].map((item) => String(item.ownerId || item.userId || "")).filter(ObjectId.isValid))).map((id) => new ObjectId(id));
  const owners = await db.collection("propertyOwners").find({ _id: { $in: ownerIds } }, { projection: { name: 1, email: 1 } }).toArray();
  const ownerMap = new Map(owners.map((owner) => [owner._id.toString(), { name: owner.name, email: owner.email }]));
  return NextResponse.json({ success: true, plan: publicLifetimePlan(plan), entitlements: entitlements.map((item) => ({ ...serialize(item), owner: ownerMap.get(String(item.ownerId)) || null })), transactions: transactions.map((item) => ({ ...serialize(item), owner: ownerMap.get(String(item.ownerId || item.userId)) || null })), revenue });
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "admin:payments:manage");
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    const current = defaultLifetimePlan();
    const allowedFeatures = Object.keys(current.features);
    const update: Record<string, unknown> = {};
    if (typeof body.price === "number" && Number.isSafeInteger(body.price) && body.price >= 0) update.price = body.price;
    if (typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency.trim().toUpperCase())) update.currency = body.currency.trim().toUpperCase();
    if (typeof body.active === "boolean") update.active = body.active;
    if (body.limits && typeof body.limits === "object") {
      const limits: Record<string, number | null> = {};
      for (const key of Object.keys(current.limits)) {
        const value = body.limits[key];
        if (value === null || value === -1 || (typeof value === "number" && Number.isInteger(value) && value >= 0)) limits[key] = value;
      }
      if (Object.keys(limits).length) update.limits = limits;
    }
    if (body.features && typeof body.features === "object") {
      const features: Record<string, boolean> = {};
      for (const key of allowedFeatures) if (typeof body.features[key] === "boolean") features[key] = body.features[key];
      if (Object.keys(features).length) update.features = features;
    }
    if (!Object.keys(update).length) return NextResponse.json({ success: false, message: "No valid Lifetime settings supplied." }, { status: 400 });

    const { db } = await connectToDatabase();
    const plans = db.collection<any>("planDefinitions");
    const existing = await plans.findOne({ $or: [{ _id: "lifetime" }, { planType: "lifetime" }] });
    const now = new Date();
    const updateFields = { ...update, updatedAt: now, updatedBy: auth.userId };

    if (existing) {
      await plans.updateOne({ _id: existing._id }, { $set: updateFields });
    } else {
      try {
        await plans.insertOne({ ...current, ...update, createdAt: now, updatedAt: now, updatedBy: auth.userId });
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const concurrentPlan = await plans.findOne({ $or: [{ _id: "lifetime" }, { planType: "lifetime" }] });
        if (!concurrentPlan) throw error;
        await plans.updateOne({ _id: concurrentPlan._id }, { $set: updateFields });
      }
    }

    await db.collection("auditLogs").insertOne({ action: "lifetime_plan_updated", adminUserId: auth.userId, changes: update, timestamp: now.toISOString() });
    return NextResponse.json({ success: true, plan: publicLifetimePlan(await getLifetimePlan(db)) });
  } catch (error) {
    logger.error("Failed to update Lifetime plan", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Unable to save Lifetime settings. Please try again." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:manage");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const ownerId = String(body.ownerId || "");
  const action = String(body.action || "");
  if (!ObjectId.isValid(ownerId) || !["grant", "suspend", "reactivate", "revoke", "refund", "chargeback"].includes(action)) return NextResponse.json({ success: false, message: "Valid ownerId and entitlement action are required." }, { status: 400 });
  const { db } = await connectToDatabase();
  const plan = await getLifetimePlan(db);
  const now = new Date();
  let entitlement = await db.collection("entitlements").findOne({ ownerId, planType: "lifetime" }, { sort: { createdAt: -1 } });
  if (action === "grant") {
    if (!entitlement) {
      const result = await db.collection("entitlements").insertOne({ ownerId, planType: "lifetime", billingType: "one_time", status: "active", purchasedAt: now, expiresAt: null, autoRenew: false, amountPaid: 0, currency: plan.currency, limits: plan.limits, features: plan.features, createdAt: now, updatedAt: now, manuallyGranted: true, grantedBy: auth.userId });
      entitlement = await db.collection("entitlements").findOne({ _id: result.insertedId });
    } else await db.collection("entitlements").updateOne({ _id: entitlement._id }, { $set: { status: "active", expiresAt: null, autoRenew: false, updatedAt: now } });
  } else if (entitlement) {
    const status = action === "reactivate" ? "active" : action === "suspend" ? "suspended" : action === "refund" ? "refunded" : action === "chargeback" ? "chargeback" : "revoked";
    await db.collection("entitlements").updateOne({ _id: entitlement._id }, { $set: { status, updatedAt: now } });
    if (["refund", "chargeback"].includes(action) && entitlement.paymentId) {
      await db.collection("payments").updateOne(
        { _id: new ObjectId(String(entitlement.paymentId)) },
        { $set: { status: action, updatedAt: now, ...(action === "refund" ? { refundedAt: now } : {}) } },
      );
    }
  }
  if (!entitlement) return NextResponse.json({ success: false, message: "Lifetime entitlement not found." }, { status: 404 });
  const active = action === "grant" || action === "reactivate";
  await db.collection("propertyOwners").updateOne({ _id: new ObjectId(ownerId) }, { $set: { tier: active ? "premium" : "free", updatedAt: now }, ...(active ? {} : { $unset: { lifetimeEntitlementId: "" } }) });
  await db.collection("auditLogs").insertOne({ action: `lifetime_entitlement_${action}`, ownerId, entitlementId: entitlement._id, adminUserId: auth.userId, timestamp: now.toISOString() });
  return NextResponse.json({ success: true, action });
}

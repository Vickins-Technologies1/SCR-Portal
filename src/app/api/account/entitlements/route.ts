import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getLifetimePlan, getOwnerEntitlementAccess, publicLifetimePlan } from "@/lib/lifetime";

function ownerIdFromRequest(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;
  const ownerId = role === "propertyOwner" ? userId : request.cookies.get("ownerId")?.value;
  return ownerId && ObjectId.isValid(ownerId) ? ownerId : null;
}

export async function GET(request: NextRequest) {
  const ownerId = ownerIdFromRequest(request);
  if (!ownerId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  try {
    const { db } = await connectToDatabase();
    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) }, { projection: { tier: 1 } });
    const access = await getOwnerEntitlementAccess(db, ownerId, owner?.tier);
    const plan = await getLifetimePlan(db);
    const lifetime = access.entitlement;

    return NextResponse.json({
      success: true,
      plan: lifetime
        ? {
            name: "Lifetime",
            type: "lifetime",
            billingType: "one_time",
            status: lifetime.status,
            purchasedUnits: lifetime.purchasedUnits || lifetime.limits?.unitLimit || null,
          }
        : { name: access.plan === "premium" ? "Premium" : "Free", type: access.plan, billingType: access.billingType, status: access.status },
      billing: lifetime
        ? {
            amountPaid: lifetime.amountPaid,
            currency: lifetime.currency,
            purchasedAt: lifetime.purchasedAt,
            expiresAt: null,
            autoRenew: false,
            providerReference: lifetime.providerReference || null,
            purchasedUnits: lifetime.purchasedUnits || lifetime.limits?.unitLimit || null,
            pricingSnapshot: lifetime.pricingSnapshot || null,
          }
        : { amountPaid: null, currency: plan.currency, purchasedAt: null, expiresAt: null, autoRenew: false },
      features: access.features,
      limits: access.limits,
      configuredLifetimePlan: publicLifetimePlan(plan),
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load account entitlements." }, { status: 500 });
  }
}

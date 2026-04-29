import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveTenantContext } from "@/lib/impersonation";
import { resolveAccountTier } from "@/lib/tier";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const { db } = await connectToDatabase();
  const tenantContext = await resolveTenantContext({
    db,
    userId,
    role,
    isImpersonating,
    impersonatingTenantId,
  });

  if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantContext.tenantId) });
  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  const ownerId =
    typeof tenant.ownerId === "string" ? tenant.ownerId : tenant.ownerId?.toString?.() || null;
  const ownerTier = ObjectId.isValid(ownerId || "")
    ? resolveAccountTier(
        (
          await db.collection("propertyOwners").findOne(
            { _id: new ObjectId(ownerId!), role: "propertyOwner" },
            { projection: { tier: 1 } }
          )
        )?.tier,
        "premium"
      )
    : "premium";

  const premiumFeatures = ownerTier === "premium";

  return NextResponse.json(
    {
      success: true,
      ownerTier,
      features: {
        canPay: premiumFeatures,
        canNotifications: premiumFeatures,
      },
    },
    { status: 200 }
  );
}


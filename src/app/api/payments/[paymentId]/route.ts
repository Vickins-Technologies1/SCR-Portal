import { NextRequest, NextResponse } from "next/server";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { calculateOverduePenalty, calculateTenantRentDueToDate, calculateWalletBalanceFromPayments, resolveTenantRequiredDeposit } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { appendOwnerActivity, resolveOwnerActivityActor } from "@/lib/owner-activity";
import { calculateFixedUtilityDue, getPostedMeteredUtilityTotal } from "@/lib/property-utilities";
import { reconcileTenantPaymentAllocation } from "@/lib/tenant-payment-allocation";

type Role = "propertyOwner" | "teamMember" | "admin";

type PaymentDoc = {
  _id: ObjectId;
  tenantId?: string | null;
  amount: number;
  propertyId: string;
  paymentDate?: string;
  createdAt?: string;
  transactionId?: string;
  mpesaCode?: string;
  status: "completed" | "pending" | "pending_stk" | "failed";
  type?: "Rent" | "Utility" | "Deposit" | "Other";
};

type TenantDoc = {
  _id: ObjectId;
  propertyId: string;
  leaseStartDate: string;
  leaseEndDate: string;
  unitType?: string;
  unitIdentifier?: string;
  leasedUnits?: Array<{
    unitIdentifier: string;
    unitType: string;
    houseNumber: string;
    price: number;
    deposit: number;
  }>;
  price: number;
  deposit: number;
  paymentStatus?: string;
  walletBalance?: number;
  totalRentPaid?: number;
  totalDepositPaid?: number;
  totalUtilityPaid?: number;
  rentPaymentOverrides?: any[];
};

type PropertyDoc = {
  _id: ObjectId;
  ownerId: string | ObjectId;
  rentPaymentDate?: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
  unitTypes?: any[];
  utilities?: any[];
};

async function resolveEffectiveOwnerId(db: Db, userId: string, role: Role): Promise<string | null> {
  if (role === "propertyOwner") return userId;
  if (role === "admin") return null;

  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });
  return member?.ownerId?.toString?.() ?? null;
}

async function canMutatePayments(db: Db, userId: string, role: Role): Promise<boolean> {
  if (role === "propertyOwner" || role === "admin") return true;

  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });
  const permissions: string[] = Array.isArray(member?.permissions) ? member.permissions : [];
  return permissions.includes("payments:record");
}

async function syncTenantTotals(db: Db, tenantId: string) {
  if (!ObjectId.isValid(tenantId)) return;
  await reconcileTenantPaymentAllocation(db, tenantId);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;

  if (!paymentId || !ObjectId.isValid(paymentId)) {
    return NextResponse.json({ success: false, message: "Valid paymentId is required" }, { status: 400 });
  }

  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    return buildInvalidCsrfResponse(request);
  }

  const userId = request.cookies.get("userId")?.value ?? null;
  const role = (request.cookies.get("role")?.value ?? null) as Role | null;

  if (!userId || !ObjectId.isValid(userId) || !role || !["propertyOwner", "teamMember", "admin"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { db } = await connectToDatabase();

  const allowed = await canMutatePayments(db, userId, role);
  if (!allowed) {
    return NextResponse.json({ success: false, message: "Insufficient permissions to delete payments" }, { status: 403 });
  }

  const payment = await db.collection<PaymentDoc>("payments").findOne({ _id: new ObjectId(paymentId) });
  if (!payment) {
    return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
  }

  const isManual = Boolean(payment.transactionId?.startsWith("MANUAL-"));
  if (!isManual) {
    return NextResponse.json(
      { success: false, message: "Only manual payments can be deleted." },
      { status: 400 }
    );
  }

  if (role !== "admin") {
    const effectiveOwnerId = await resolveEffectiveOwnerId(db, userId, role);
    if (!effectiveOwnerId || !ObjectId.isValid(effectiveOwnerId)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const property = ObjectId.isValid(payment.propertyId)
      ? await db.collection<PropertyDoc>("properties").findOne({ _id: new ObjectId(payment.propertyId) })
      : null;

    const ownerId = property?.ownerId?.toString?.() ?? null;
    if (!property || !ownerId || ownerId !== effectiveOwnerId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
  }

  await db.collection("payments").deleteOne({ _id: new ObjectId(paymentId) });

  if (payment.tenantId) {
    await syncTenantTotals(db, payment.tenantId);
  }

  let ownerIdForActivity: string | null = null;
  if (role === "admin") {
    const property = ObjectId.isValid(payment.propertyId)
      ? await db.collection<PropertyDoc>("properties").findOne({ _id: new ObjectId(payment.propertyId) })
      : null;
    ownerIdForActivity = property?.ownerId?.toString?.() ?? null;
  } else {
    const actor = await resolveOwnerActivityActor(request);
    ownerIdForActivity = actor?.ownerId ?? null;
  }

  if (ownerIdForActivity) {
    await appendOwnerActivity(db, {
      ownerId: ownerIdForActivity,
      actor: {
        userId,
        role,
        ownerId: ownerIdForActivity,
        impersonator: null,
      },
      action: "payments.manual.delete",
      summary: `Deleted manual payment of ${payment.amount}.`,
      entity: { type: "payment", id: paymentId },
      metadata: { tenantId: payment.tenantId ?? null, propertyId: payment.propertyId, type: payment.type ?? null },
    });
  }

  return NextResponse.json({ success: true, message: "Manual payment deleted" }, { status: 200 });
}

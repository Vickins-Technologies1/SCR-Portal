import { NextRequest, NextResponse } from "next/server";
import { Db, ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { appendOwnerActivity } from "@/lib/owner-activity";

type SessionContext = {
  userId: string;
  role: "propertyOwner" | "teamMember";
  ownerId: string;
  canDelete: boolean;
  assignedPropertyIds?: string[] | null;
};

async function resolveSession(request: NextRequest): Promise<SessionContext | null> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
    return null;
  }

  if (role === "propertyOwner") {
    return { userId, role: "propertyOwner", ownerId: userId, canDelete: true };
  }

  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });
  if (!member?.ownerId) return null;

  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const assignedPropertyIds: string[] | null = Array.isArray((member as any).assignedPropertyIds)
    ? Array.from(
        new Set(
          (member as any).assignedPropertyIds
            .map((value: any) => String(value || "").trim())
            .filter((value: string) => ObjectId.isValid(value))
        )
      ) as string[]
    : null;

  return {
    userId,
    role: "teamMember",
    ownerId: member.ownerId.toString(),
    canDelete: permissions.includes("payments:record"),
    assignedPropertyIds,
  };
}

async function syncTenantAfterUtilityDelete(db: Db, tenantId: string) {
  if (!ObjectId.isValid(tenantId)) return;

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
  if (!tenant) return;

  const property = ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne({ _id: new ObjectId(String(tenant.propertyId)) })
    : null;

  const now = new Date();
  const state = await calculateTenantFinancialState(db, tenant, { property, asOf: now });
  const totalRemainingDues = state.totalOutstanding;

  await db.collection("tenants").updateOne(
    { _id: new ObjectId(tenantId) },
    {
      $set: {
        walletBalance: state.walletBalance,
        paymentStatus: totalRemainingDues > 0 ? "overdue" : "up-to-date",
        updatedAt: now.toISOString(),
      },
    }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Valid utility charge id is required" }, { status: 400 });
  }

  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!session.canDelete) {
    return NextResponse.json({ success: false, message: "Insufficient permissions to delete utility readings" }, { status: 403 });
  }

  const { db } = await connectToDatabase();
  const charge = await db.collection("utilityCharges").findOne({ _id: new ObjectId(id) });
  if (!charge) {
    return NextResponse.json({ success: false, message: "Utility reading not found" }, { status: 404 });
  }

  if (String(charge.ownerId) !== session.ownerId) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  if (session.role === "teamMember" && Array.isArray(session.assignedPropertyIds) && session.assignedPropertyIds.length > 0) {
    if (!session.assignedPropertyIds.includes(String(charge.propertyId))) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
  }

  await db.collection("utilityCharges").deleteOne({ _id: new ObjectId(id) });
  await syncTenantAfterUtilityDelete(db, String(charge.tenantId));

  await appendOwnerActivity(db, {
    ownerId: session.ownerId,
    actor: {
      userId: session.userId,
      role: session.role,
      ownerId: session.ownerId,
      impersonator: null,
    },
    action: "utilities.usage.delete",
    summary: `Deleted utility reading ${String(charge.utilityName || "utility")} for tenant.`,
    entity: { type: "tenant", id: String(charge.tenantId) },
    metadata: {
      propertyId: String(charge.propertyId),
      utilityId: String(charge.utilityId),
      billingPeriod: String(charge.billingPeriod || ""),
      amount: Number(charge.amount || 0),
    },
  });

  return NextResponse.json({ success: true, message: "Utility reading deleted" }, { status: 200 });
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

async function resolveEffectiveOwnerId() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value ?? null;
  const role = cookieStore.get("role")?.value ?? null;

  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
    return { ok: false as const, userId: null, role: null, ownerId: null };
  }

  if (role === "propertyOwner") {
    return { ok: true as const, userId, role, ownerId: userId };
  }

  const { db } = await connectToDatabase();
  const teamMember = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });

  const ownerId = teamMember?.ownerId?.toString?.() ?? null;
  if (!ownerId || !ObjectId.isValid(ownerId)) {
    return { ok: false as const, userId, role, ownerId: null };
  }

  return { ok: true as const, userId, role, ownerId };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; overrideId: string }> }
) {
  const { tenantId, overrideId } = await params;

  if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Valid tenantId is required" }, { status: 400 });
  }
  if (!overrideId || typeof overrideId !== "string") {
    return NextResponse.json({ success: false, message: "Valid overrideId is required" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return buildInvalidCsrfResponse(request);
  }

  const auth = await resolveEffectiveOwnerId();
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { db } = await connectToDatabase();
  const result = await db.collection("tenants").updateOne(
    { _id: new ObjectId(tenantId), ownerId: auth.ownerId },
    {
      $set: {
        "rentPaymentOverrides.$[override].status": "inactive",
        "rentPaymentOverrides.$[override].updatedAt": new Date(),
        updatedAt: new Date().toISOString(),
      },
    },
    { arrayFilters: [{ "override._id": overrideId }] }
  );

  if (!result.matchedCount) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }
  if (!result.modifiedCount) {
    return NextResponse.json({ success: false, message: "Override not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Override cancelled" }, { status: 200 });
}


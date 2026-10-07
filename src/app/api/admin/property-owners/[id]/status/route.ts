import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../../../../../../lib/mongodb";
import { requireAdmin } from "../../../../../../lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../../../lib/csrf";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request, "admin:owners:suspend");
  if (auth instanceof NextResponse) return auth;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const status = body?.status;
  if (status !== "active" && status !== "suspended") return NextResponse.json({ success: false, message: "status must be active or suspended" }, { status: 400 });
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const { db } = await connectToDatabase();
  const ownerId = new ObjectId(id);
  const owner = await db.collection("propertyOwners").findOne({ _id: ownerId, role: "propertyOwner" }, { projection: { accountStatus: 1 } });
  if (!owner) return NextResponse.json({ success: false, message: "Property owner not found" }, { status: 404 });
  const previousStatus = owner.accountStatus === "suspended" ? "suspended" : "active";
  await db.collection("propertyOwners").updateOne({ _id: ownerId }, { $set: { accountStatus: status, updatedAt: new Date(), ...(status === "suspended" ? { suspensionReason: reason || null, suspendedAt: new Date() } : { suspensionReason: null, restoredAt: new Date() }) } });
  await db.collection("auditLogs").insertOne({ action: status === "suspended" ? "property_owner_suspended" : "property_owner_restored", propertyOwnerId: id, adminUserId: auth.userId, previousStatus, status, reason: reason || null, timestamp: new Date().toISOString() });
  return NextResponse.json({ success: true, accountStatus: status });
}

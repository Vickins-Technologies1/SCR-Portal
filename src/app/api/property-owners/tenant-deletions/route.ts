import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Db, ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { Tenant } from "@/types/tenant";
import { Property } from "@/types/property";

type TenantDeletionStatus = "Pending" | "Approved" | "Rejected";

interface TenantDeletionRequestDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  ownerId: string;
  requestedBy: string;
  status: TenantDeletionStatus;
  createdAt: Date;
  updatedAt: Date;
  decisionNote?: string;
  decisionAt?: Date;
  tenantName?: string;
  propertyId?: ObjectId;
  houseNumber?: string;
  unitType?: string;
  unitIdentifier?: string;
  requesterName?: string;
}

interface TeamMemberDoc {
  _id: ObjectId;
  name?: string;
  email?: string;
}

const resolveOwnerIdForGet = async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId || !ObjectId.isValid(userId)) return null;
  if (role === "propertyOwner") return userId;
  if (role !== "teamMember") return null;

  const { db } = await connectToDatabase();
  const teamMember = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });
  return teamMember?.ownerId?.toString() || null;
};

const resolveOwnerIdForUpdate = async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId || !ObjectId.isValid(userId)) return null;
  if (role !== "propertyOwner") return null;

  return userId;
};

const restoreUnitQuantity = async (db: Db, propertyId: string, unitIdentifier?: string) => {
  if (!unitIdentifier) return;
  await db.collection<Property>("properties").updateOne(
    { _id: new ObjectId(propertyId) },
    { $inc: { "unitTypes.$[elem].quantity": 1 } },
    { arrayFilters: [{ "elem.uniqueType": unitIdentifier }] }
  );
};

export async function GET(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !validateCsrfToken(req, csrfHeader)) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  const ownerId = await resolveOwnerIdForGet();
  if (!ownerId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const statusFilter =
      statusParam && ["Pending", "Approved", "Rejected"].includes(statusParam)
        ? (statusParam as TenantDeletionStatus)
        : null;

    const requests = await db
      .collection<TenantDeletionRequestDoc>("tenant_deletion_requests")
      .find(statusFilter ? { ownerId, status: statusFilter } : { ownerId })
      .sort({ createdAt: -1 })
      .toArray();

    const tenantIds = Array.from(new Set(requests.map((r) => r.tenantId.toString())));
    const propertyIds = Array.from(
      new Set(requests.map((r) => r.propertyId?.toString()).filter(Boolean) as string[])
    );
    const requesterIds = Array.from(new Set(requests.map((r) => r.requestedBy).filter(Boolean)));

    const [tenants, properties, teamMembers] = await Promise.all([
      tenantIds.length
        ? db.collection<Tenant>("tenants").find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) } }).toArray()
        : [],
      propertyIds.length
        ? db.collection<Property>("properties").find({ _id: { $in: propertyIds.map((id) => new ObjectId(id)) } }).toArray()
        : [],
      requesterIds.length
        ? db.collection<TeamMemberDoc>("teamMembers").find({ _id: { $in: requesterIds.map((id) => new ObjectId(id)) } }).toArray()
        : [],
    ]);

    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
    const requesterMap = new Map(
      teamMembers.map((m) => [m._id.toString(), m.name || m.email || "Team member"])
    );

    const formatted = requests.map((req) => ({
      _id: req._id.toString(),
      tenantId: req.tenantId.toString(),
      ownerId: req.ownerId,
      requestedBy: req.requestedBy,
      requestedByName:
        req.requesterName ||
        requesterMap.get(req.requestedBy) ||
        "Team member",
      propertyId: req.propertyId?.toString(),
      propertyName:
        propertyMap.get(req.propertyId?.toString() || "")?.name || "Unknown Property",
      tenantName:
        req.tenantName ||
        tenantMap.get(req.tenantId.toString())?.name ||
        "Unknown Tenant",
      houseNumber: req.houseNumber,
      unitType: req.unitType,
      unitIdentifier: req.unitIdentifier,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt?.toISOString?.() || req.createdAt.toISOString(),
      decisionNote: req.decisionNote,
      decisionAt: req.decisionAt ? req.decisionAt.toISOString() : undefined,
    }));

    return NextResponse.json({ success: true, data: { requests: formatted } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/property-owners/tenant-deletions error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch deletion requests" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !validateCsrfToken(req, csrfHeader)) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  const ownerId = await resolveOwnerIdForUpdate();
  if (!ownerId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: { requestId?: string; status?: TenantDeletionStatus; decisionNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const { requestId, status, decisionNote } = body;

  if (!requestId || !ObjectId.isValid(requestId)) {
    return NextResponse.json({ success: false, message: "Valid requestId is required" }, { status: 400 });
  }
  if (!status || !["Approved", "Rejected"].includes(status)) {
    return NextResponse.json({ success: false, message: "Invalid status value" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    const existing = await db.collection<TenantDeletionRequestDoc>("tenant_deletion_requests").findOne({
      _id: new ObjectId(requestId),
      ownerId,
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Request not found or unauthorized" }, { status: 404 });
    }

    const now = new Date();
    let deletedPaymentsCount = 0;
    let tenantAlreadyDeleted = false;

    if (status === "Approved") {
      const tenant = await db.collection<Tenant>("tenants").findOne({
        _id: existing.tenantId,
        ownerId,
      });

      if (!tenant) {
        tenantAlreadyDeleted = true;
      } else {
        await db.collection<Tenant>("tenants").deleteOne({ _id: tenant._id });

        const paymentsResult = await db.collection("payments").deleteMany({
          tenantId: tenant._id.toString(),
        });
        deletedPaymentsCount = paymentsResult.deletedCount || 0;

        if (tenant.propertyId && ObjectId.isValid(tenant.propertyId)) {
          await restoreUnitQuantity(db, tenant.propertyId, tenant.unitIdentifier);
        }
      }
    }

    await db.collection("tenant_deletion_requests").updateOne(
      { _id: new ObjectId(requestId) },
      {
        $set: {
          status,
          decisionNote: decisionNote?.trim() || undefined,
          decisionAt: now,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json(
      {
        success: true,
        message:
          status === "Approved"
            ? tenantAlreadyDeleted
              ? "Request approved. Tenant was already removed."
              : "Request approved. Tenant deleted."
            : "Request rejected.",
        deletedPaymentsCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PATCH /api/property-owners/tenant-deletions error:", error);
    return NextResponse.json({ success: false, message: "Failed to update deletion request" }, { status: 500 });
  }
}

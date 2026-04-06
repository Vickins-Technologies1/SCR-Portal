import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Db, MongoClient, ObjectId } from "mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

type VacateStatus = "Pending" | "Approved" | "Rejected";

interface VacateRequestDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  ownerId: string;
  propertyId: ObjectId;
  message: string;
  requestedMoveOutDate?: string;
  status: VacateStatus;
  createdAt: Date;
  updatedAt: Date;
  decisionNote?: string;
  decisionAt?: Date;
  tenantName?: string;
  houseNumber?: string;
  unitType?: string;
}

interface TenantDoc {
  _id: ObjectId;
  name: string;
  email?: string;
  phone?: string;
}

interface PropertyDoc {
  _id: ObjectId;
  name: string;
}

const client = new MongoClient(process.env.MONGODB_URI!);
let cachedDb: Db | null = null;

const connectToDatabase = async (): Promise<Db> => {
  if (cachedDb) return cachedDb;
  await client.connect();
  cachedDb = client.db("rentaldb");
  return cachedDb;
};

const resolveEffectiveOwnerId = async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId) return null;

  if (role === "propertyOwner") return userId;

  if (role === "teamMember") {
    const db = await connectToDatabase();
    const teamMember = await db.collection("teamMembers").findOne({
      _id: new ObjectId(userId),
      active: true,
    });
    return teamMember?.ownerId?.toString() || null;
  }

  return null;
};

export async function GET(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !(await validateCsrfToken(req, csrfHeader))) {
    return buildInvalidCsrfResponse(req);
  }

  const effectiveOwnerId = await resolveEffectiveOwnerId();
  if (!effectiveOwnerId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await connectToDatabase();

    const requests = await db
      .collection<VacateRequestDoc>("vacate_requests")
      .find({ ownerId: effectiveOwnerId })
      .sort({ createdAt: -1 })
      .toArray();

    const tenantIds = Array.from(new Set(requests.map((r) => r.tenantId.toString())));
    const propertyIds = Array.from(new Set(requests.map((r) => r.propertyId.toString())));

    const [tenants, properties] = await Promise.all([
      db.collection<TenantDoc>("tenants").find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) } }).toArray(),
      db.collection<PropertyDoc>("properties").find({ _id: { $in: propertyIds.map((id) => new ObjectId(id)) } }).toArray(),
    ]);

    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    const formatted = requests.map((req) => ({
      _id: req._id.toString(),
      tenantId: req.tenantId.toString(),
      ownerId: req.ownerId,
      propertyId: req.propertyId.toString(),
      message: req.message,
      requestedMoveOutDate: req.requestedMoveOutDate,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
      decisionNote: req.decisionNote,
      decisionAt: req.decisionAt ? req.decisionAt.toISOString() : undefined,
      tenantName: req.tenantName || tenantMap.get(req.tenantId.toString())?.name || "Unknown Tenant",
      propertyName: propertyMap.get(req.propertyId.toString())?.name || "Unknown Property",
      houseNumber: req.houseNumber,
      unitType: req.unitType,
    }));

    return NextResponse.json({ success: true, data: { requests: formatted } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/property-owners/vacate error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch vacate requests" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !(await validateCsrfToken(req, csrfHeader))) {
    return buildInvalidCsrfResponse(req);
  }

  const effectiveOwnerId = await resolveEffectiveOwnerId();
  if (!effectiveOwnerId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: { requestId?: string; status?: VacateStatus; decisionNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const { requestId, status, decisionNote } = body;

  if (!requestId || !ObjectId.isValid(requestId)) {
    return NextResponse.json({ success: false, message: "Valid requestId is required" }, { status: 400 });
  }
  if (!status || !["Pending", "Approved", "Rejected"].includes(status)) {
    return NextResponse.json({ success: false, message: "Invalid status value" }, { status: 400 });
  }

  try {
    const db = await connectToDatabase();

    const existing = await db.collection<VacateRequestDoc>("vacate_requests").findOne({
      _id: new ObjectId(requestId),
      ownerId: effectiveOwnerId,
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Vacate request not found or unauthorized" }, { status: 404 });
    }

    const now = new Date();
    await db.collection("vacate_requests").updateOne(
      { _id: new ObjectId(requestId) },
      {
        $set: {
          status,
          decisionNote: decisionNote?.trim() || undefined,
          decisionAt: status === "Pending" ? undefined : now,
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/property-owners/vacate error:", error);
    return NextResponse.json({ success: false, message: "Failed to update vacate request" }, { status: 500 });
  }
}

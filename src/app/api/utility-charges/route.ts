import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { UtilityCharge } from "@/lib/property-utilities";
import { appendOwnerActivityFromRequest } from "@/lib/owner-activity";
import { PropertyUtility } from "@/types/property";

type SessionContext = {
  userId: string;
  role: "propertyOwner" | "teamMember";
  ownerId: string;
  canRecord: boolean;
};

type ChargeBody = {
  tenantId?: string;
  utilityId?: string;
  billingPeriod?: string;
  previousReading?: number | string | null;
  currentReading?: number | string | null;
  unitsUsed?: number | string | null;
  csrfToken?: string;
};

const billingPeriodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function resolveSession(request: NextRequest): Promise<SessionContext | null> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
    return null;
  }

  if (role === "propertyOwner") {
    return { userId, role, ownerId: userId, canRecord: true };
  }

  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });

  if (!member?.ownerId) return null;
  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  return {
    userId,
    role: "teamMember",
    ownerId: member.ownerId.toString(),
    canRecord: permissions.includes("payments:record"),
  };
}

export async function GET(request: NextRequest) {
  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    return buildInvalidCsrfResponse(request);
  }

  const context = await resolveSession(request);
  if (!context) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Valid tenantId is required" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const tenant = await db.collection("tenants").findOne({
    _id: new ObjectId(tenantId),
    ownerId: context.ownerId,
  });

  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  const charges = await db
    .collection<UtilityCharge>("utilityCharges")
    .find({ tenantId, status: "posted" })
    .sort({ billingPeriod: -1, utilityName: 1 })
    .limit(24)
    .toArray();

  return NextResponse.json({
    success: true,
    charges: charges.map((charge) => ({
      ...charge,
      _id: charge._id?.toString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  let body: ChargeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const csrfToken = body.csrfToken || request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const context = await resolveSession(request);
  if (!context) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!context.canRecord) {
    return NextResponse.json({ success: false, message: "Insufficient permissions to record utility usage" }, { status: 403 });
  }

  const tenantId = body.tenantId || "";
  if (!ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Valid tenantId is required" }, { status: 400 });
  }

  if (!body.utilityId) {
    return NextResponse.json({ success: false, message: "Utility is required" }, { status: 400 });
  }

  const billingPeriod = String(body.billingPeriod || "").trim();
  if (!billingPeriodPattern.test(billingPeriod)) {
    return NextResponse.json({ success: false, message: "Billing period must be in YYYY-MM format" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const tenant = await db.collection("tenants").findOne({
    _id: new ObjectId(tenantId),
    ownerId: context.ownerId,
  });

  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  const property = ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne({
        _id: new ObjectId(String(tenant.propertyId)),
        ownerId: context.ownerId,
      })
    : null;

  if (!property) {
    return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
  }

  const utility = ((property.utilities || []) as PropertyUtility[]).find(
    (item) => item.id === body.utilityId && item.active !== false
  );

  if (!utility || utility.billingMode !== "metered") {
    return NextResponse.json(
      { success: false, message: "Select an active metered utility for this property" },
      { status: 400 }
    );
  }

  const previousReading = toNumber(body.previousReading);
  const currentReading = toNumber(body.currentReading);
  const manualUnitsUsed = toNumber(body.unitsUsed);

  let unitsUsed = manualUnitsUsed ?? null;
  if (previousReading !== null || currentReading !== null) {
    if (previousReading === null || currentReading === null) {
      return NextResponse.json(
        { success: false, message: "Enter both previous and current readings, or enter units used only" },
        { status: 400 }
      );
    }
    if (currentReading < previousReading) {
      return NextResponse.json(
        { success: false, message: "Current reading cannot be lower than previous reading" },
        { status: 400 }
      );
    }
    unitsUsed = currentReading - previousReading;
  }

  if (unitsUsed === null || unitsUsed <= 0) {
    return NextResponse.json({ success: false, message: "Units used must be greater than 0" }, { status: 400 });
  }

  const ratePerUnit = Number(utility.amount || 0);
  if (!Number.isFinite(ratePerUnit) || ratePerUnit <= 0) {
    return NextResponse.json({ success: false, message: "Metered utility rate is not configured" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const amount = Math.round(unitsUsed * ratePerUnit);
  const charge: Omit<UtilityCharge, "_id" | "createdAt"> = {
    ownerId: context.ownerId,
    propertyId: property._id.toString(),
    tenantId,
    utilityId: utility.id,
    utilityName: utility.name,
    billingPeriod,
    previousReading: previousReading ?? undefined,
    currentReading: currentReading ?? undefined,
    unitsUsed,
    ratePerUnit,
    amount,
    status: "posted",
    updatedAt: nowIso,
  };

  const result = await db.collection<UtilityCharge>("utilityCharges").findOneAndUpdate(
    {
      tenantId,
      utilityId: utility.id,
      billingPeriod,
      status: "posted",
    },
    {
      $set: charge,
      $setOnInsert: { _id: new ObjectId(), createdAt: nowIso },
    },
    { upsert: true, returnDocument: "after" }
  );

  await appendOwnerActivityFromRequest(db, request, {
    action: "utilities.usage.record",
    summary: `Recorded ${utility.name} usage for ${tenant.name || "tenant"}: Ksh ${amount}.`,
    entity: { type: "tenant", id: tenantId, label: tenant.name || null },
    metadata: {
      propertyId: property._id.toString(),
      utilityId: utility.id,
      billingPeriod,
      unitsUsed,
      amount,
    },
  });

  return NextResponse.json({
    success: true,
    charge: {
      ...result,
      _id: result?._id?.toString(),
    },
  });
}

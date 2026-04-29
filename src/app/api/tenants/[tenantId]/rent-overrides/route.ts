import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

type RentOverrideStatus = "active" | "inactive";

type TenantRentOverride = {
  _id: string;
  price: number;
  startDate: Date | string;
  endDate: Date | string;
  status?: RentOverrideStatus;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const parseYearMonth = (value: string): { year: number; month: number } | null => {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const normalizeStartOfMonth = (value: string | Date): Date | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  const parsed = parseYearMonth(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, 1);
};

const normalizeEndOfMonth = (value: string | Date): Date | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const parsed = parseYearMonth(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999);
};

const toIso = (value?: Date | string) => {
  if (!value) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
};

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart <= bEnd && aEnd >= bStart;

const normalize = (overrides: unknown): TenantRentOverride[] => {
  if (!Array.isArray(overrides)) return [];
  return overrides
    .filter((o): o is TenantRentOverride => Boolean(o && typeof o === "object"))
    .map((override) => ({
      ...override,
      status: override.status ?? "active",
    }));
};

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Valid tenantId is required" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return buildInvalidCsrfResponse(request);
  }

  const auth = await resolveEffectiveOwnerId();
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { db } = await connectToDatabase();
  const tenant = await db.collection("tenants").findOne({
    _id: new ObjectId(tenantId),
    ownerId: auth.ownerId,
  });

  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  const overrides = normalize((tenant as any).rentPaymentOverrides);
  const formatted = overrides
    .map((override) => ({
      ...override,
      startDate: toIso(override.startDate),
      endDate: toIso(override.endDate),
      createdAt: toIso(override.createdAt),
      updatedAt: toIso(override.updatedAt),
    }))
    .sort((a, b) => new Date(String(a.startDate)).getTime() - new Date(String(b.startDate)).getTime());

  return NextResponse.json({ success: true, overrides: formatted }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Valid tenantId is required" }, { status: 400 });
  }

  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) {
    return buildInvalidCsrfResponse(request);
  }

  const auth = await resolveEffectiveOwnerId();
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const price = Number(body?.price);
  const startDateRaw = body?.startDate;
  const endDateRaw = body?.endDate;

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ success: false, message: "price must be a number >= 0" }, { status: 400 });
  }

  const normalizedStart = normalizeStartOfMonth(startDateRaw || "");
  const normalizedEnd = normalizeEndOfMonth(endDateRaw || "");

  if (!normalizedStart || !normalizedEnd) {
    return NextResponse.json({ success: false, message: "Valid startDate and endDate are required" }, { status: 400 });
  }
  if (normalizedStart > normalizedEnd) {
    return NextResponse.json({ success: false, message: "startDate must be before endDate" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const tenant = await db.collection("tenants").findOne({
    _id: new ObjectId(tenantId),
    ownerId: auth.ownerId,
  });

  if (!tenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  const existing = normalize((tenant as any).rentPaymentOverrides);
  const overlapping = existing.find((override) => {
    if (override.status === "inactive") return false;
    const start = override.startDate instanceof Date ? override.startDate : new Date(String(override.startDate));
    const end = override.endDate instanceof Date ? override.endDate : new Date(String(override.endDate));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return overlaps(start, end, normalizedStart, normalizedEnd);
  });

  if (overlapping) {
    return NextResponse.json(
      { success: false, message: "A rent override already exists within that period for this tenant." },
      { status: 400 }
    );
  }

  const override: TenantRentOverride = {
    _id: new ObjectId().toString(),
    price,
    startDate: normalizedStart,
    endDate: normalizedEnd,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("tenants").updateOne(
    { _id: new ObjectId(tenantId), ownerId: auth.ownerId },
    {
      $set: { updatedAt: new Date().toISOString() },
      $push: { rentPaymentOverrides: override as any },
    }
  );

  return NextResponse.json(
    {
      success: true,
      override: {
        ...override,
        startDate: toIso(override.startDate),
        endDate: toIso(override.endDate),
        createdAt: toIso(override.createdAt),
        updatedAt: toIso(override.updatedAt),
      },
    },
    { status: 201 }
  );
}


import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { RentPriceOverride } from "@/types/rent-price-override";

const parseYearMonth = (value: string): { year: number; month: number } | null => {
  const trimmed = value.trim();
  // Accept YYYY-MM, YYYY-MM-DD, and full ISO timestamps; only year+month matter for overrides.
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
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
  // JS Date month is 0-based; passing `month` (1-12) with day 0 yields last day of that month.
  return new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999);
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || !ObjectId.isValid(propertyId)) {
      return NextResponse.json({ success: false, message: "Valid propertyId is required" }, { status: 400 });
    }

    const cookies = request.cookies;
    const role = cookies.get("role")?.value;
    const userId = cookies.get("userId")?.value;

    if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    const property = await db.collection("properties").findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    const ownerId = typeof property.ownerId === "string" ? property.ownerId : property.ownerId?.toString?.();

    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid property owner" }, { status: 400 });
    }

    if (role === "propertyOwner" && ownerId !== userId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        ownerId: new ObjectId(ownerId),
        active: true,
      });
      if (!teamMember) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    const propertyIdAsObjectId = new ObjectId(propertyId);
    const overrides = await db
      .collection<RentPriceOverride>("rentPriceOverrides")
      .find({
        status: { $ne: "inactive" },
        // `propertyId` is stored as a string in new data, but may be an ObjectId in legacy records.
        $or: [{ propertyId }, { propertyId: propertyIdAsObjectId as any }],
      })
      .sort({ startDate: 1 })
      .toArray();

    const formatted = overrides.map((override) => ({
      ...override,
      _id: override._id?.toString?.() ?? override._id,
      propertyId: override.propertyId?.toString?.() ?? override.propertyId,
      startDate: override.startDate instanceof Date ? override.startDate.toISOString() : override.startDate,
      endDate: override.endDate instanceof Date ? override.endDate.toISOString() : override.endDate,
      createdAt: override.createdAt instanceof Date ? override.createdAt.toISOString() : override.createdAt,
      updatedAt: override.updatedAt instanceof Date ? override.updatedAt.toISOString() : override.updatedAt,
    }));

    return NextResponse.json({ success: true, overrides: formatted }, { status: 200 });
  } catch (error) {
    console.error("GET /rent-price-overrides error", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(request, csrfHeader)) {
      return buildInvalidCsrfResponse(request);
    }

    const cookies = request.cookies;
    const role = cookies.get("role")?.value;
    const userId = cookies.get("userId")?.value;

    if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, unitType, unitIdentifier, price, startDate, endDate } = body as {
      propertyId?: string;
      unitType?: string;
      unitIdentifier?: string;
      price?: number;
      startDate?: string;
      endDate?: string;
    };

    if (!propertyId || !ObjectId.isValid(propertyId)) {
      return NextResponse.json({ success: false, message: "Valid propertyId is required" }, { status: 400 });
    }
    if (!unitType || typeof unitType !== "string") {
      return NextResponse.json({ success: false, message: "unitType is required" }, { status: 400 });
    }
    if (typeof price !== "number" || Number.isNaN(price) || price < 0) {
      return NextResponse.json({ success: false, message: "price must be a number >= 0" }, { status: 400 });
    }

    const normalizedStart = normalizeStartOfMonth(startDate || "");
    const normalizedEnd = normalizeEndOfMonth(endDate || "");

    if (!normalizedStart || !normalizedEnd) {
      return NextResponse.json({ success: false, message: "Valid startDate and endDate are required" }, { status: 400 });
    }
    if (normalizedStart > normalizedEnd) {
      return NextResponse.json({ success: false, message: "startDate must be before endDate" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const property = await db.collection("properties").findOne({ _id: new ObjectId(propertyId) });
    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    const ownerId = typeof property.ownerId === "string" ? property.ownerId : property.ownerId?.toString?.();

    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid property owner" }, { status: 400 });
    }

    if (role === "propertyOwner" && ownerId !== userId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        ownerId: new ObjectId(ownerId),
        active: true,
      });
      if (!teamMember) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    const unitTypes = Array.isArray(property.unitTypes)
      ? property.unitTypes.map((unit: { type?: string; uniqueType?: string }, index: number) => ({
          ...unit,
          uniqueType: unit.uniqueType || `${unit.type}-${index}`,
        }))
      : [];

    let selectedUnit = unitIdentifier
      ? unitTypes.find((unit) => unit.uniqueType === unitIdentifier)
      : null;

    if (!selectedUnit) {
      const matches = unitTypes.filter((unit) => unit.type === unitType);
      if (matches.length > 1) {
        return NextResponse.json(
          { success: false, message: "Multiple unit groups share this type. Please pick a specific unit group." },
          { status: 400 }
        );
      }
      selectedUnit = matches[0] ?? null;
    }

    if (!selectedUnit) {
      return NextResponse.json({ success: false, message: "Unit type not found on property" }, { status: 400 });
    }

    const resolvedUnitType = selectedUnit.type as string;
    const resolvedUnitIdentifier = selectedUnit.uniqueType as string;

    const propertyIdAsObjectId = new ObjectId(propertyId);
    const overlapQuery: Record<string, unknown> = {
      status: { $ne: "inactive" },
      startDate: { $lte: normalizedEnd },
      endDate: { $gte: normalizedStart },
      $and: [
        // `propertyId` is stored as a string in new data, but may be an ObjectId in legacy records.
        { $or: [{ propertyId }, { propertyId: propertyIdAsObjectId as any }] },
      ],
    };

    if (resolvedUnitIdentifier) {
      (overlapQuery.$and as any[]).push({
        $or: [
          { unitIdentifier: resolvedUnitIdentifier },
          { unitType: resolvedUnitType, unitIdentifier: { $exists: false } },
          { unitType: resolvedUnitType, unitIdentifier: null },
        ],
      });
    } else {
      (overlapQuery.$and as any[]).push({ unitType: resolvedUnitType });
    }

    const overlapping = await db.collection<RentPriceOverride>("rentPriceOverrides").findOne(overlapQuery);
    if (overlapping) {
      return NextResponse.json(
        { success: false, message: "A price override already exists for this unit type within that period" },
        { status: 400 }
      );
    }

    const newOverride: RentPriceOverride = {
      ownerId: ownerId,
      propertyId: propertyId,
      unitType: resolvedUnitType,
      unitIdentifier: resolvedUnitIdentifier,
      price,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<RentPriceOverride>("rentPriceOverrides").insertOne(newOverride);

    return NextResponse.json(
      {
        success: true,
        override: {
          ...newOverride,
          _id: result.insertedId.toString(),
          startDate: normalizedStart.toISOString(),
          endDate: normalizedEnd.toISOString(),
          createdAt: newOverride.createdAt?.toISOString(),
          updatedAt: newOverride.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /rent-price-overrides error", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

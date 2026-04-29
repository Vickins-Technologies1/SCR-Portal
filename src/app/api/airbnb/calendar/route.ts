import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { addDays, getMonthRange, parseDate, toIso } from "@/lib/airbnb-utils";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

function parseMonth(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  return new Date(year, monthIndex, 1);
}

function toSafeIso(date: Date): string {
  const safe = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  return toIso(safe);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");
  const monthParam = searchParams.get("month");
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();

  const monthBase = parseMonth(monthParam);
  const parsedStart = parseDate(startParam);
  const parsedEnd = parseDate(endParam);
  const monthRange = getMonthRange(monthBase || new Date());
  const start = parsedStart || monthRange.start;
  const end = parsedEnd || monthRange.end;
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const calendarDocs = await db
    .collection("airbnbCalendar")
    .find({
      ownerId,
      date: { $gte: toIso(start), $lte: toIso(end) },
    })
    .toArray();

  const calendarByListing = new Map<string, Map<string, (typeof calendarDocs)[number]>>();
  for (const doc of calendarDocs) {
    const listingId = doc.listingId || doc.externalListingId || doc.listingName;
    if (!calendarByListing.has(listingId)) {
      calendarByListing.set(listingId, new Map());
    }
    const key = String(doc.dateKey || "").slice(0, 10) || String(doc.date || "").slice(0, 10);
    if (key) {
      calendarByListing.get(listingId)!.set(key, doc);
    }
  }

  const nightsRange = Array.from({ length: days }).map((_, index) => addDays(start, index));

  const calendar = listings.map((listing) => {
    const listingId = listing.externalId || listing._id?.toString?.() || listing.name;
    const nights = nightsRange.map((day) => {
      const iso = toSafeIso(day);
      const match = calendarByListing.get(listingId)?.get(iso.slice(0, 10));
      return {
        date: iso,
        status: match?.status || "available",
        rate: match?.rate ?? listing.baseRate ?? 0,
        note: match?.note,
      };
    });
    return {
      propertyId: listingId,
      propertyName: listing.name,
      nights,
    };
  });

  const settings =
    (await db.collection("airbnbCalendarSettings").findOne({ ownerId })) as
      | {
          minNights?: number;
          maxNights?: number;
          advanceNotice?: number;
          prepTime?: number;
        }
      | null;

  return NextResponse.json({
    success: true,
    calendar,
    settings: {
      minNights: settings?.minNights ?? 2,
      maxNights: settings?.maxNights ?? 21,
      advanceNotice: settings?.advanceNotice ?? 1,
      prepTime: settings?.prepTime ?? 1,
    },
  });
}

const CalendarUpdateSchema = z.object({
  type: z.enum(["night", "settings", "bulk_price"]),
  listingId: z.string().optional(),
  listingName: z.string().optional(),
  date: z.string().optional(),
  status: z.enum(["available", "booked", "blocked"]).optional(),
  rate: z.preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().nonnegative().optional()),
  note: z.string().trim().optional(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  minNights: z.preprocess((value) => Number(value), z.number().int().min(1).max(365)).optional(),
  maxNights: z.preprocess((value) => Number(value), z.number().int().min(1).max(365)).optional(),
  advanceNotice: z.preprocess((value) => Number(value), z.number().int().min(0).max(365)).optional(),
  prepTime: z.preprocess((value) => Number(value), z.number().int().min(0).max(30)).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = CalendarUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid calendar payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();

  if (parsed.data.type === "settings") {
    await db.collection("airbnbCalendarSettings").updateOne(
      { ownerId },
      {
        $set: {
          minNights: parsed.data.minNights ?? 2,
          maxNights: parsed.data.maxNights ?? 21,
          advanceNotice: parsed.data.advanceNotice ?? 1,
          prepTime: parsed.data.prepTime ?? 1,
          updatedAt: now,
        },
        $setOnInsert: { ownerId, createdAt: now },
      },
      { upsert: true }
    );
    return NextResponse.json({ success: true });
  }

  if (parsed.data.type === "bulk_price") {
    if (!parsed.data.listingId || !parsed.data.dates?.length) {
      return NextResponse.json({ success: false, message: "Listing and dates are required." }, { status: 400 });
    }

    const rate = parsed.data.rate ?? 0;
    const note = parsed.data.note || null;
    const listingId = parsed.data.listingId;

    const operations = parsed.data.dates.map((dateKey) => {
      const canonicalDate = `${dateKey}T12:00:00.000Z`;
      return {
        updateOne: {
          filter: { ownerId, listingId, $or: [{ dateKey }, { date: { $regex: `^${dateKey}` } }] },
          update: {
            $set: {
              ownerId,
              listingId,
              listingName: parsed.data.listingName,
              dateKey,
              date: canonicalDate,
              status: "available",
              rate,
              note,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      };
    });

    if (operations.length) {
      await db.collection("airbnbCalendar").bulkWrite(operations, { ordered: false });
    }

    return NextResponse.json({ success: true, updated: operations.length });
  }

  if (!parsed.data.listingId || !parsed.data.date) {
    return NextResponse.json({ success: false, message: "Listing and date are required." }, { status: 400 });
  }

  const dateKey = String(parsed.data.date).slice(0, 10);
  const canonicalDate = `${dateKey}T12:00:00.000Z`;

  await db.collection("airbnbCalendar").updateOne(
    {
      ownerId,
      listingId: parsed.data.listingId,
      $or: [{ dateKey }, { date: { $regex: `^${dateKey}` } }],
    },
    {
      $set: {
        ownerId,
        listingId: parsed.data.listingId,
        listingName: parsed.data.listingName,
        dateKey,
        date: canonicalDate,
        status: parsed.data.status || "available",
        rate: parsed.data.rate ?? 0,
        note: parsed.data.note || null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}

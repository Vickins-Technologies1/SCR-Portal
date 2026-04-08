import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { addDays, toIso } from "@/lib/airbnb-utils";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();
  const start = new Date();
  const end = addDays(start, 13);
  const calendarDocs = await db
    .collection("airbnbCalendar")
    .find({
      ownerId,
      date: { $gte: toIso(start), $lte: toIso(end) },
    })
    .toArray();

  const calendarByListing = new Map<string, typeof calendarDocs>();
  for (const doc of calendarDocs) {
    const listingId = doc.listingId || doc.externalListingId || doc.listingName;
    if (!calendarByListing.has(listingId)) {
      calendarByListing.set(listingId, []);
    }
    calendarByListing.get(listingId)!.push(doc);
  }

  const nightsRange = Array.from({ length: 14 }).map((_, index) => addDays(start, index));

  const calendar = listings.map((listing) => {
    const listingId = listing.externalId || listing._id?.toString?.() || listing.name;
    const nights = nightsRange.map((day) => {
      const iso = toIso(day);
      const match = (calendarByListing.get(listingId) || []).find((doc) => doc.date?.startsWith(iso.slice(0, 10)));
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
  type: z.enum(["night", "settings"]),
  listingId: z.string().optional(),
  listingName: z.string().optional(),
  date: z.string().optional(),
  status: z.enum(["available", "booked", "blocked"]).optional(),
  rate: z.preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().nonnegative().optional()),
  note: z.string().trim().optional(),
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

  if (!parsed.data.listingId || !parsed.data.date) {
    return NextResponse.json({ success: false, message: "Listing and date are required." }, { status: 400 });
  }

  await db.collection("airbnbCalendar").updateOne(
    { ownerId, listingId: parsed.data.listingId, date: parsed.data.date },
    {
      $set: {
        ownerId,
        listingId: parsed.data.listingId,
        listingName: parsed.data.listingName,
        date: parsed.data.date,
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

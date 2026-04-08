import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { ensureAirbnbSeed } from "@/lib/airbnb-seed";
import { addDays, toIso } from "@/lib/airbnb-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  await ensureAirbnbSeed(db, ownerId);

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

  return NextResponse.json({ success: true, calendar });
}

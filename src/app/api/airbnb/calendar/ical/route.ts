import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { parseDate } from "@/lib/airbnb-utils";

const formatICSDate = (value: Date) =>
  value.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

const sanitize = (value: string) =>
  value.replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const listingId = searchParams.get("listingId");

  const { db } = await connectToDatabase();

  let ownerId: string | null = null;
  if (token) {
    const settings = await db.collection("airbnbSettings").findOne({
      icalToken: token,
      icalExportEnabled: true,
    });
    ownerId = settings?.ownerId || null;
  } else {
    const requestedOwnerId = searchParams.get("ownerId");
    const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
    if (resolved.response) return resolved.response;
    ownerId = resolved.context?.ownerId || null;
  }

  if (!ownerId) {
    return NextResponse.json({ success: false, message: "Unauthorized iCal request" }, { status: 401 });
  }

  const bookingFilter: Record<string, any> = { ownerId, status: { $ne: "cancelled" } };
  if (listingId) bookingFilter.listingId = listingId;

  const bookings = await db.collection("airbnbBookings").find(bookingFilter).toArray();

  const events = bookings
    .map((booking) => {
      const start = parseDate(booking.checkIn);
      const end = parseDate(booking.checkOut);
      if (!start || !end) return null;
      return [
        "BEGIN:VEVENT",
        `UID:${sanitize(booking.externalId || booking._id?.toString?.() || "")}`,
        `DTSTAMP:${formatICSDate(new Date())}`,
        `DTSTART:${formatICSDate(start)}`,
        `DTEND:${formatICSDate(end)}`,
        `SUMMARY:${sanitize(booking.listingName || "Airbnb booking")}`,
        `DESCRIPTION:${sanitize(`Guest: ${booking.guestName || "Guest"}`)}`,
        `LOCATION:${sanitize(booking.listingName || "")}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .filter(Boolean)
    .join("\r\n");

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sorana//Airbnb Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Sorana Airbnb Availability",
    events,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new NextResponse(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": "attachment; filename=airbnb-calendar.ics",
    },
  });
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: { icalUrl?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.icalUrl) {
    return NextResponse.json({ success: false, message: "iCal URL is required" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  await db.collection("airbnbSettings").updateOne(
    { ownerId },
    { $set: { icalImportUrl: payload.icalUrl, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );

  return NextResponse.json({ success: true, message: "iCal import URL saved." });
}

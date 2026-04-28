import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { resolveTenantContext } from "@/lib/impersonation";
import { diffNights, parseDate } from "@/lib/airbnb-utils";
import { syncAirbnbBookingPaymentStatus } from "@/lib/airbnb-payments";

const ExtendStaySchema = z.object({
  newCheckOut: z.string().trim().min(1),
});

async function resolveAirbnbGuestBooking(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const { db } = await connectToDatabase();
  const tenantContext = await resolveTenantContext({
    db,
    userId,
    role,
    isImpersonating,
    impersonatingTenantId,
  });

  if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
    return { db, tenantContext: null, tenant: null, booking: null, bookingId: null };
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantContext.tenantId) });
  if (!tenant) {
    return { db, tenantContext, tenant: null, booking: null, bookingId: null };
  }

  if (tenant.accountType !== "airbnb_guest" || !tenant.airbnbBookingId) {
    return { db, tenantContext, tenant, booking: null, bookingId: null };
  }

  if (tenant.expiresAt) {
    const expiresAt = new Date(String(tenant.expiresAt));
    if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
      return { db, tenantContext, tenant: null, booking: null, bookingId: null };
    }
  }

  const bookingId = String(tenant.airbnbBookingId);
  const ownerId = String(tenant.ownerId || "");
  const booking = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
  if (!booking) {
    return { db, tenantContext, tenant, booking: null, bookingId };
  }

  return { db, tenantContext, tenant, booking, bookingId };
}

function computeExtensionQuote(params: { booking: any; listing: any | null; requestedCheckOut: Date }) {
  const checkIn = parseDate(params.booking.checkIn) || new Date();
  const currentCheckOut = parseDate(params.booking.checkOut) || new Date(checkIn.getTime() + 86400000);
  const requestedCheckOut = params.requestedCheckOut;

  const currentNights = diffNights(checkIn, currentCheckOut);
  const requestedNights = diffNights(checkIn, requestedCheckOut);
  const additionalNights = Math.max(0, requestedNights - currentNights);

  const baseRate = Number(params.listing?.baseRate || 0);
  const fallbackRate = currentNights > 0 ? Number(params.booking.total || 0) / currentNights : 0;
  const nightlyRate = baseRate > 0 ? baseRate : fallbackRate;

  const additionalAmount = Math.max(0, Math.round(additionalNights * nightlyRate));
  const originalTotal = Number(params.booking.total || 0);
  const newTotal = Math.round(originalTotal + additionalAmount);

  return {
    currentCheckOut: currentCheckOut.toISOString(),
    requestedCheckOut: requestedCheckOut.toISOString(),
    additionalNights,
    additionalAmount,
    newTotal,
  };
}

export async function GET(request: NextRequest) {
  const resolved = await resolveAirbnbGuestBooking(request);
  if (!resolved.tenantContext || !resolved.tenant || !resolved.booking) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const ownerId = String(resolved.tenant.ownerId || "");
  const bookingId = resolved.bookingId!;

  const { searchParams } = new URL(request.url);
  const newCheckOut = searchParams.get("newCheckOut");

  if (newCheckOut) {
    const requestedCheckOutDate = parseDate(newCheckOut);
    if (!requestedCheckOutDate) {
      return NextResponse.json({ success: false, message: "Invalid new check-out date" }, { status: 400 });
    }

    const currentCheckOutDate = parseDate(resolved.booking.checkOut);
    if (!currentCheckOutDate || requestedCheckOutDate <= currentCheckOutDate) {
      return NextResponse.json(
        { success: false, message: "New check-out must be after the current check-out date." },
        { status: 400 }
      );
    }

    const listing = await resolved.db.collection("airbnbListings").findOne({
      ownerId,
      externalId: String(resolved.booking.listingId || ""),
    });

    const quote = computeExtensionQuote({
      booking: resolved.booking,
      listing,
      requestedCheckOut: requestedCheckOutDate,
    });

    if (!quote.additionalNights || quote.additionalAmount <= 0) {
      return NextResponse.json({ success: false, message: "Nothing to extend for that date." }, { status: 400 });
    }

    return NextResponse.json({ success: true, quote });
  }

  const extension = await resolved.db
    .collection("airbnbStayExtensions")
    .findOne(
      { ownerId, bookingId, tenantId: String(resolved.tenantContext.tenantId) },
      { sort: { createdAt: -1, _id: -1 } }
    );

  return NextResponse.json({
    success: true,
    extension: extension
      ? {
          status: extension.status,
          requestedCheckOut: extension.requestedCheckOut,
          additionalAmount: extension.additionalAmount,
          createdAt: extension.createdAt,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token") || request.headers.get("X-CSRF-Token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ExtendStaySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const resolved = await resolveAirbnbGuestBooking(request);
  if (!resolved.tenantContext || !resolved.tenant || !resolved.booking) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const ownerId = String(resolved.tenant.ownerId || "");
  const bookingId = resolved.bookingId!;

  const requestedCheckOutDate = parseDate(parsed.data.newCheckOut);
  if (!requestedCheckOutDate) {
    return NextResponse.json({ success: false, message: "Invalid new check-out date" }, { status: 400 });
  }

  const currentCheckOutDate = parseDate(resolved.booking.checkOut);
  if (!currentCheckOutDate || requestedCheckOutDate <= currentCheckOutDate) {
    return NextResponse.json(
      { success: false, message: "New check-out must be after the current check-out date." },
      { status: 400 }
    );
  }

  const listing = await resolved.db.collection("airbnbListings").findOne({
    ownerId,
    externalId: String(resolved.booking.listingId || ""),
  });

  const quote = computeExtensionQuote({
    booking: resolved.booking,
    listing,
    requestedCheckOut: requestedCheckOutDate,
  });

  if (!quote.additionalNights || quote.additionalAmount <= 0) {
    return NextResponse.json({ success: false, message: "Nothing to extend for that date." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const tenantId = String(resolved.tenantContext.tenantId);

  await resolved.db.collection("airbnbStayExtensions").insertOne({
    ownerId,
    bookingId,
    tenantId,
    status: "pending_payment",
    currentCheckOut: quote.currentCheckOut,
    requestedCheckOut: quote.requestedCheckOut,
    additionalNights: quote.additionalNights,
    additionalAmount: quote.additionalAmount,
    originalTotal: Number(resolved.booking.total || 0),
    newTotal: quote.newTotal,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await resolved.db.collection("airbnbBookings").updateOne(
    { ownerId, externalId: bookingId },
    { $set: { total: quote.newTotal, updatedAt: nowIso } }
  );

  await syncAirbnbBookingPaymentStatus(resolved.db, { ownerId, bookingId, nowIso });

  return NextResponse.json({
    success: true,
    quote,
    extension: {
      status: "pending_payment",
      requestedCheckOut: quote.requestedCheckOut,
      additionalAmount: quote.additionalAmount,
      createdAt: nowIso,
    },
  });
}

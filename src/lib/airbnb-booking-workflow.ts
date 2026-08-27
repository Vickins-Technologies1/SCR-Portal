import { ObjectId, type Db } from "mongodb";
import { addDays, diffNights, parseDate } from "@/lib/airbnb-utils";
import { sendAirbnbBookingConfirmationEmail } from "@/lib/email";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export type AirbnbBookingRecord = {
  _id?: ObjectId;
  ownerId: string;
  externalId?: string;
  listingId?: string;
  listingName?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestIdNumber?: string | null;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  total?: number;
  amountPaid?: number;
  status?: string;
  source?: string;
  payoutStatus?: string;
  reference?: string;
  guestCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
  paymentMethod?: string;
  mpesaCode?: string | null;
  paymentDate?: string | null;
  verifiedBy?: string | null;
  verificationTimestamp?: string | null;
  confirmationTimestamp?: string | null;
  confirmedAt?: string | null;
  specialRequests?: string;
};

export type AirbnbOwnerProfile = {
  name: string;
  email?: string;
  phone?: string;
};

export type AirbnbBookingPayment = {
  amount?: number;
  status?: string;
  provider?: string;
  mpesaCode?: string | null;
  reference?: string | null;
  paymentDate?: string | null;
  verifiedBy?: string | null;
  verificationTimestamp?: string | null;
  paymentMethod?: string | null;
};

export function resolveAirbnbBookingReference(booking: AirbnbBookingRecord): string {
  const existing = String(booking.reference || "").trim();
  if (existing) return existing;

  const source = String(booking.externalId || booking._id?.toString?.() || "").replace(/[^a-zA-Z0-9]/g, "");
  const suffix = (source.slice(-5) || "00000").toUpperCase();
  const createdAt = parseDate(booking.createdAt || null) || new Date();
  const datePart = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `SRN-${datePart}-${suffix.padStart(5, "0")}`;
}

export function resolveAirbnbPaymentMethod(payment?: AirbnbBookingPayment | null): string {
  if (!payment) return "M-Pesa";
  const provider = String(payment.paymentMethod || payment.provider || "").trim().toLowerCase();
  if (!provider || provider === "mpesa" || provider === "tuma") return "M-Pesa";
  if (provider === "cash") return "Cash";
  if (provider === "bank") return "Bank";
  return payment.paymentMethod || payment.provider || "M-Pesa";
}

export async function resolveAirbnbOwnerProfile(db: Db, ownerId: string): Promise<AirbnbOwnerProfile> {
  const normalizedOwnerId = String(ownerId || "").trim();
  if (!normalizedOwnerId) return { name: "Host" };

  const ownerObjectId = ObjectId.isValid(normalizedOwnerId) ? new ObjectId(normalizedOwnerId) : null;
  const projection = { name: 1, email: 1, phone: 1 } as const;

  if (ownerObjectId) {
    const propertyOwner = await db.collection("propertyOwners").findOne({ _id: ownerObjectId }, { projection });
    if (propertyOwner) {
      return {
        name: String(propertyOwner.name || "Host"),
        email: propertyOwner.email ? String(propertyOwner.email) : undefined,
        phone: propertyOwner.phone ? String(propertyOwner.phone) : undefined,
      };
    }

    const userOwner = await db.collection("users").findOne({ _id: ownerObjectId, role: "propertyOwner" }, { projection });
    if (userOwner) {
      return {
        name: String(userOwner.name || "Host"),
        email: userOwner.email ? String(userOwner.email) : undefined,
        phone: userOwner.phone ? String(userOwner.phone) : undefined,
      };
    }
  }

  return { name: "Host" };
}

export async function findAirbnbBookingConflict(
  db: Db,
  params: {
    ownerId: string;
    listingId: string;
    checkIn: string | Date;
    checkOut: string | Date;
    excludeBookingId?: string;
  }
): Promise<AirbnbBookingRecord | null> {
  const checkIn = parseDate(params.checkIn);
  const checkOut = parseDate(params.checkOut);
  if (!checkIn || !checkOut) return null;

  const query: Record<string, unknown> = {
    ownerId: params.ownerId,
    listingId: params.listingId,
    status: { $ne: "cancelled" },
    checkIn: { $lt: checkOut.toISOString() },
    checkOut: { $gt: checkIn.toISOString() },
  };

  if (params.excludeBookingId) {
    query.externalId = { $ne: params.excludeBookingId };
  }

  return (await db.collection("airbnbBookings").findOne(query)) as AirbnbBookingRecord | null;
}

export async function reserveAirbnbBookingCalendar(
  db: Db,
  booking: AirbnbBookingRecord,
  nowIso = new Date().toISOString()
): Promise<void> {
  const checkIn = parseDate(booking.checkIn || null);
  const checkOut = parseDate(booking.checkOut || null);
  const listingId = String(booking.listingId || "").trim();
  if (!checkIn || !checkOut || !listingId) return;

  const totalNights = diffNights(checkIn, checkOut);
  const listingName = String(booking.listingName || "Airbnb Stay");
  const bookingReference = resolveAirbnbBookingReference(booking);

  const operations = Array.from({ length: totalNights }, (_, index) => {
    const date = addDays(checkIn, index);
    const dateKey = date.toISOString().slice(0, 10);
    const canonicalDate = `${dateKey}T12:00:00.000Z`;

    return {
      updateOne: {
        filter: {
          ownerId: booking.ownerId,
          listingId,
          $or: [{ dateKey }, { date: { $regex: `^${dateKey}` } }],
        },
        update: {
          $set: {
            ownerId: booking.ownerId,
            listingId,
            listingName,
            dateKey,
            date: canonicalDate,
            status: "booked",
            rate: Number(booking.total || 0) / Math.max(1, totalNights),
            note: `Booked ${bookingReference}`,
            updatedAt: nowIso,
          },
          $setOnInsert: { createdAt: nowIso },
        },
        upsert: true,
      },
    };
  });

  if (operations.length > 0) {
    await db.collection("airbnbCalendar").bulkWrite(operations, { ordered: false });
  }
}

export async function sendAirbnbBookingStatusNotifications(
  _db: Db,
  params: {
    booking: AirbnbBookingRecord;
    payment?: AirbnbBookingPayment | null;
    ownerProfile: AirbnbOwnerProfile;
    settings?: { sendBookingConfirmation?: boolean; supportEmail?: string | null } | null;
    status: "pending_verification" | "confirmed";
    bookingUpdatedAt?: string;
  }
): Promise<void> {
  const booking = params.booking;
  const bookingReference = resolveAirbnbBookingReference(booking);
  const checkIn = parseDate(booking.checkIn || null);
  const checkOut = parseDate(booking.checkOut || null);
  const checkInLabel = checkIn
    ? checkIn.toLocaleDateString("en-KE", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const checkOutLabel = checkOut
    ? checkOut.toLocaleDateString("en-KE", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const total = Number(booking.total || 0);
  const nights = Number(booking.nights || 0) || (checkIn && checkOut ? diffNights(checkIn, checkOut) : 1);
  const amountPaid = Number(params.payment?.amount ?? booking.amountPaid ?? total);
  const paymentMethod = resolveAirbnbPaymentMethod(params.payment);
  const mpesaCode = String(params.payment?.mpesaCode || params.payment?.reference || "").trim() || null;
  const hostContact = String(params.ownerProfile.phone || "").trim();
  const hostName = String(params.ownerProfile.name || "Host").trim();
  const guestName = String(booking.guestName || "Guest").trim();
  const listingName = String(booking.listingName || "Airbnb Stay").trim();
  const paymentDate = String(params.payment?.paymentDate || booking.paymentDate || params.bookingUpdatedAt || new Date().toISOString()).trim();
  const verifiedBy = String(params.payment?.verifiedBy || "System").trim();

  if (params.settings?.sendBookingConfirmation === false) {
    return;
  }

  if (booking.guestEmail) {
    try {
      await sendAirbnbBookingConfirmationEmail({
        to: booking.guestEmail,
        guestName,
        listingName,
        checkIn: checkInLabel,
        checkOut: checkOutLabel,
        nights,
        total,
        supportEmail: params.settings?.supportEmail || undefined,
        bookingReference,
        bookingStatus: params.status,
        hostName,
        hostPhone: hostContact || undefined,
        paymentMethod,
        mpesaCode: mpesaCode || undefined,
      });
    } catch {
      // Swallow notification failures so booking confirmation still succeeds.
    }
  }

  if (params.status === "confirmed" && params.ownerProfile.email) {
    try {
      await sendAirbnbBookingConfirmationEmail({
        to: params.ownerProfile.email,
        guestName,
        listingName,
        checkIn: checkInLabel,
        checkOut: checkOutLabel,
        nights,
        total,
        supportEmail: params.settings?.supportEmail || undefined,
        bookingReference,
        bookingStatus: "confirmed",
        hostName,
        hostPhone: hostContact || undefined,
        paymentMethod,
        mpesaCode: mpesaCode || undefined,
      });
    } catch {
      // ignore
    }
  }

  if (params.status === "confirmed" && hostContact) {
    try {
      if (booking.guestPhone) {
        await sendWhatsAppMessage({
          phone: booking.guestPhone,
          message:
            `Booking confirmed for ${listingName}\n` +
            `Reference: ${bookingReference}\n` +
            `Guest: ${guestName}\n` +
            `Check-in: ${checkInLabel}\n` +
            `Check-out: ${checkOutLabel}\n` +
            `Amount paid: KES ${amountPaid.toLocaleString("en-KE")}\n` +
            `Payment method: ${paymentMethod}` +
            (mpesaCode ? `\nM-Pesa reference: ${mpesaCode}` : ""),
        });
      }
    } catch {
      // ignore
    }

    try {
      await sendWhatsAppMessage({
        phone: hostContact,
        message:
          `Booking confirmed for ${listingName}\n` +
          `Reference: ${bookingReference}\n` +
          `Guest: ${guestName}\n` +
          `Check-in: ${checkInLabel}\n` +
          `Check-out: ${checkOutLabel}\n` +
          `Payment: KES ${amountPaid.toLocaleString("en-KE")} via ${paymentMethod}` +
          (mpesaCode ? `\nM-Pesa reference: ${mpesaCode}` : ""),
      });
    } catch {
      // ignore
    }
  }
}

export async function finalizeAirbnbBookingPayment(
  db: Db,
  params: {
    ownerId: string;
    bookingId: string;
    nowIso?: string;
  }
): Promise<{
  booking: AirbnbBookingRecord | null;
  payment: AirbnbBookingPayment | null;
  confirmed: boolean;
  conflict: AirbnbBookingRecord | null;
  bookingReference: string | null;
}> {
  const nowIso = params.nowIso || new Date().toISOString();
  const bookingId = String(params.bookingId || "").trim();
  const ownerId = String(params.ownerId || "").trim();

  const booking = (await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId })) as AirbnbBookingRecord | null;
  if (!booking) {
    return { booking: null, payment: null, confirmed: false, conflict: null, bookingReference: null };
  }

  const latestPayment = (await db.collection("payments").findOne(
    { ownerId, airbnbBookingId: bookingId, status: "completed" },
    { sort: { paymentDate: -1, createdAt: -1 } }
  )) as AirbnbBookingPayment | null;

  const bookingReference = resolveAirbnbBookingReference(booking);
  const confirmedAt = booking.confirmationTimestamp || booking.updatedAt || nowIso;

  const paymentPatch: Record<string, unknown> = {
    payoutStatus: "paid",
    amountPaid: Number(latestPayment?.amount ?? booking.total ?? 0),
    paymentMethod: resolveAirbnbPaymentMethod(latestPayment),
    mpesaCode: latestPayment?.mpesaCode || latestPayment?.reference || null,
    paymentDate: latestPayment?.paymentDate || nowIso,
    verifiedBy: latestPayment?.verifiedBy || "System",
    verificationTimestamp: latestPayment?.verificationTimestamp || nowIso,
    reference: bookingReference,
    updatedAt: nowIso,
  };

  const conflict = await findAirbnbBookingConflict(db, {
    ownerId,
    listingId: String(booking.listingId || ""),
    checkIn: booking.checkIn || "",
    checkOut: booking.checkOut || "",
    excludeBookingId: bookingId,
  });

  if (conflict) {
    await db.collection("airbnbBookings").updateOne(
      { ownerId, externalId: bookingId },
      { $set: { ...paymentPatch, status: booking.status || "pending", updatedAt: nowIso } }
    );
    return {
      booking: { ...booking, ...paymentPatch, status: booking.status || "pending" },
      payment: latestPayment,
      confirmed: false,
      conflict,
      bookingReference,
    };
  }

  const wasConfirmed = String(booking.status || "").toLowerCase() === "confirmed";
  const bookingPatch: Record<string, unknown> = {
    ...paymentPatch,
    status: "confirmed",
    confirmedAt: booking.confirmedAt || confirmedAt,
    confirmationTimestamp: booking.confirmationTimestamp || nowIso,
  };

  await db.collection("airbnbBookings").updateOne({ ownerId, externalId: bookingId }, { $set: bookingPatch });

  const confirmedBooking = { ...booking, ...bookingPatch, status: "confirmed" } as AirbnbBookingRecord;
  await reserveAirbnbBookingCalendar(db, confirmedBooking, nowIso);

  const settings = await db.collection("airbnbSettings").findOne({ ownerId });
  const ownerProfile = await resolveAirbnbOwnerProfile(db, ownerId);

  if (!wasConfirmed) {
    await sendAirbnbBookingStatusNotifications(db, {
      booking: confirmedBooking,
      payment: latestPayment,
      ownerProfile,
      settings: {
        sendBookingConfirmation: settings?.sendBookingConfirmation,
        supportEmail: settings?.supportEmail || null,
      },
      status: "confirmed",
      bookingUpdatedAt: nowIso,
    });
  }

  return {
    booking: confirmedBooking,
    payment: latestPayment,
    confirmed: !wasConfirmed,
    conflict: null,
    bookingReference,
  };
}

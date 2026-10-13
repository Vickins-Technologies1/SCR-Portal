import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { sendAirbnbReminderEmail } from "@/lib/email";
import { parseDate } from "@/lib/airbnb-utils";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { withCronJobLock } from "@/lib/cron-lock";

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const STALE_REMINDER_CLAIM_MS = 15 * 60 * 1000;

async function claimReminder(db: Awaited<ReturnType<typeof connectToDatabase>>["db"], bookingId: ObjectId, kind: "CheckIn" | "CheckOut") {
  const claimedAt = new Date();
  const claimed = await db.collection("airbnbBookings").updateOne(
    {
      _id: bookingId,
      [`${kind.toLowerCase()}ReminderSent`]: { $ne: true },
      $or: [
        { [`${kind.toLowerCase()}ReminderClaimedAt`]: { $exists: false } },
        { [`${kind.toLowerCase()}ReminderClaimedAt`]: { $lt: new Date(claimedAt.getTime() - STALE_REMINDER_CLAIM_MS) } },
      ],
    },
    { $set: { [`${kind.toLowerCase()}ReminderClaimedAt`]: claimedAt } },
  );
  return claimed.modifiedCount === 1 ? claimedAt : null;
}

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  }
  try {
    const { db } = await connectToDatabase();
    const run = await withCronJobLock(db, "airbnb-reminders", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const windowStart = startOfDay(tomorrow);
    const windowEnd = endOfDay(tomorrow);

    const bookings = await db
      .collection("airbnbBookings")
      .find({ status: { $ne: "cancelled" }, guestEmail: { $exists: true, $ne: "" } })
      .toArray();

    const ownerIds = Array.from(new Set(bookings.map((b) => b.ownerId).filter(Boolean)));
    const settingsDocs = ownerIds.length
      ? await db.collection("airbnbSettings").find({ ownerId: { $in: ownerIds } }).toArray()
      : [];
    const settingsMap = new Map<string, { supportEmail?: string; sendCheckInReminder?: boolean; sendCheckOutReminder?: boolean }>(
      settingsDocs.map((doc: any) => [
        String(doc.ownerId || ""),
        {
          supportEmail: doc.supportEmail,
          sendCheckInReminder: doc.sendCheckInReminder,
          sendCheckOutReminder: doc.sendCheckOutReminder,
        },
      ])
    );

    let sent = 0;
    let skipped = 0;

    for (const booking of bookings) {
      const settings = settingsMap.get(booking.ownerId);
      const supportEmail = settings?.supportEmail;

      const checkInDate = parseDate(booking.checkIn);
      const checkOutDate = parseDate(booking.checkOut);

      if (
        checkInDate &&
        checkInDate >= windowStart &&
        checkInDate <= windowEnd &&
        !booking.checkInReminderSent
      ) {
        if (settings?.sendCheckInReminder === false) {
          skipped += 1;
        } else {
          const claimedAt = await claimReminder(db, booking._id, "CheckIn");
          if (!claimedAt) skipped += 1;
          if (claimedAt) {
          await sendAirbnbReminderEmail({
            to: booking.guestEmail,
            guestName: booking.guestName || "Guest",
            listingName: booking.listingName || "Airbnb Stay",
            date: checkInDate.toLocaleDateString("en-KE", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            supportEmail,
            type: "checkin",
          });
          sent += 1;
          await db.collection("airbnbBookings").updateOne(
            { _id: booking._id, checkInReminderClaimedAt: claimedAt },
            { $set: { checkInReminderSent: true, updatedAt: new Date().toISOString() }, $unset: { checkInReminderClaimedAt: "" } },
          );
          }
        }
      }

      if (
        checkOutDate &&
        checkOutDate >= windowStart &&
        checkOutDate <= windowEnd &&
        !booking.checkOutReminderSent
      ) {
        if (settings?.sendCheckOutReminder === false) {
          skipped += 1;
        } else {
          const claimedAt = await claimReminder(db, booking._id, "CheckOut");
          if (!claimedAt) skipped += 1;
          if (claimedAt) {
          await sendAirbnbReminderEmail({
            to: booking.guestEmail,
            guestName: booking.guestName || "Guest",
            listingName: booking.listingName || "Airbnb Stay",
            date: checkOutDate.toLocaleDateString("en-KE", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            supportEmail,
            type: "checkout",
          });
          sent += 1;
          await db.collection("airbnbBookings").updateOne(
            { _id: booking._id, checkOutReminderClaimedAt: claimedAt },
            { $set: { checkOutReminderSent: true, updatedAt: new Date().toISOString() }, $unset: { checkOutReminderClaimedAt: "" } },
          );
          }
        }
      }
    }

    return { sent, skipped };
    });
    if (!run.acquired) return NextResponse.json({ success: true, skipped: true, reason: "already_running" });
    return NextResponse.json({ success: true, message: `Airbnb reminders sent. Sent ${run.result.sent}, skipped ${run.result.skipped}.` });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to send reminders" },
      { status: 500 }
    );
  }
}

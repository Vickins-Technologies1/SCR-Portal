import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sendAirbnbReminderEmail } from "@/lib/email";
import { parseDate } from "@/lib/airbnb-utils";

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export async function GET() {
  try {
    const { db } = await connectToDatabase();
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
    const updates: any[] = [];

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
          updates.push({
            updateOne: {
              filter: { _id: booking._id },
              update: { $set: { checkInReminderSent: true, updatedAt: new Date().toISOString() } },
            },
          });
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
          updates.push({
            updateOne: {
              filter: { _id: booking._id },
              update: { $set: { checkOutReminderSent: true, updatedAt: new Date().toISOString() } },
            },
          });
        }
      }
    }

    if (updates.length > 0) {
      await db.collection("airbnbBookings").bulkWrite(updates);
    }

    return NextResponse.json({
      success: true,
      message: `Airbnb reminders sent. Sent ${sent}, skipped ${skipped}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to send reminders" },
      { status: 500 }
    );
  }
}

import type { Db } from "mongodb";

export function buildAirbnbPaymentReference(bookingId: string): string {
  const trimmed = bookingId.trim();
  return trimmed.startsWith("ABNB-") ? trimmed : `ABNB-${trimmed}`;
}

export function parseAirbnbPaymentReference(reference: string): string | null {
  if (!reference) return null;
  if (!reference.startsWith("ABNB-")) return null;
  const value = reference.replace(/^ABNB-/, "").trim();
  return value || null;
}

export function normalizeAirbnbPaymentStatus(status: string | null | undefined): "pending" | "paid" | "failed" {
  const normalized = (status || "").toLowerCase();
  if (["completed", "paid", "success"].includes(normalized)) return "paid";
  if (["failed", "cancelled", "canceled"].includes(normalized)) return "failed";
  return "pending";
}

export type AirbnbBookingPayoutStatus = "pending" | "paid" | "failed";

export async function getAirbnbBookingPaymentSummary(
  db: Db,
  params: { ownerId: string; bookingId: string }
): Promise<{ amountPaid: number; latestStatus: string | null }> {
  const bookingId = params.bookingId.trim();
  const ownerId = params.ownerId.trim();

  const paidAgg = await db
    .collection("payments")
    .aggregate<{ amountPaid: number }>([
      { $match: { ownerId, airbnbBookingId: bookingId, status: "completed" } },
      {
        $group: {
          _id: null,
          amountPaid: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } },
        },
      },
    ])
    .toArray();

  const amountPaid = Number(paidAgg?.[0]?.amountPaid || 0);

  const latest = await db.collection("payments").findOne(
    { ownerId, airbnbBookingId: bookingId },
    { sort: { createdAt: -1, _id: -1 }, projection: { status: 1 } }
  );

  return {
    amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
    latestStatus: latest?.status ? String(latest.status) : null,
  };
}

export async function syncAirbnbBookingPaymentStatus(
  db: Db,
  params: { ownerId: string; bookingId: string; nowIso?: string }
): Promise<{ payoutStatus: AirbnbBookingPayoutStatus; amountPaid: number; remaining: number; total: number } | null> {
  const bookingId = params.bookingId.trim();
  const ownerId = params.ownerId.trim();
  const nowIso = params.nowIso || new Date().toISOString();

  const booking = await db.collection("airbnbBookings").findOne(
    { ownerId, externalId: bookingId },
    { projection: { total: 1 } }
  );
  if (!booking) return null;

  const total = Number(booking.total || 0);
  const { amountPaid, latestStatus } = await getAirbnbBookingPaymentSummary(db, { ownerId, bookingId });
  const remaining = Math.max(0, total - amountPaid);

  const latestNormalized = normalizeAirbnbPaymentStatus(latestStatus);
  const payoutStatus: AirbnbBookingPayoutStatus =
    total <= 0 || amountPaid >= total
      ? "paid"
      : latestNormalized === "failed"
        ? "failed"
        : "pending";

  await db.collection("airbnbBookings").updateOne(
    { ownerId, externalId: bookingId },
    { $set: { payoutStatus, amountPaid, updatedAt: nowIso } }
  );

  return { payoutStatus, amountPaid, remaining, total };
}

export async function deactivateAirbnbGuestTenantsForBooking(
  db: Db,
  params: { ownerId: string; bookingId: string; nowIso?: string }
): Promise<void> {
  const nowIso = params.nowIso || new Date().toISOString();
  await db.collection("tenants").updateMany(
    { ownerId: params.ownerId, accountType: "airbnb_guest", airbnbBookingId: params.bookingId },
    { $set: { status: "inactive", updatedAt: nowIso } }
  );
}

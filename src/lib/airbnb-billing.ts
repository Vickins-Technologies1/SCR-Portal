import { Db } from "mongodb";
import { getMonthRange, parseDate } from "./airbnb-utils";

type RevenueSource = {
  paymentDate?: string | Date;
  createdAt?: string | Date;
  amount?: number;
};

type PayoutSource = {
  createdAt?: string | Date;
  period?: string | Date;
  amount?: number;
};

export type AirbnbRevenueSources = {
  directPayments: RevenueSource[];
  payouts: PayoutSource[];
};

export type AirbnbRevenueBreakdown = {
  direct: number;
  payouts: number;
  total: number;
};

export const AIRBNB_SOFTWARE_LEASING_PERCENT = 1;

export async function fetchAirbnbRevenueSources(db: Db, ownerId: string): Promise<AirbnbRevenueSources> {
  const directPaymentsRaw = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect", status: "completed" })
    .toArray();

  const payoutsRaw = await db
    .collection("airbnbPayouts")
    .find({ ownerId, status: "paid" })
    .toArray();

  const directPayments: RevenueSource[] = directPaymentsRaw.map((payment: any) => ({
    paymentDate: payment.paymentDate,
    createdAt: payment.createdAt,
    amount: payment.amount,
  }));

  const payouts: PayoutSource[] = payoutsRaw.map((payout: any) => ({
    createdAt: payout.createdAt,
    period: payout.period,
    amount: payout.amount,
  }));

  return { directPayments, payouts };
}

export function sumAirbnbRevenueForRange(
  sources: AirbnbRevenueSources,
  start: Date,
  end: Date
): AirbnbRevenueBreakdown {
  const inRange = (value?: string | Date | null) => {
    const parsed = parseDate(value || null);
    return parsed && parsed >= start && parsed <= end;
  };

  const direct = sources.directPayments
    .filter((payment) => inRange(payment.paymentDate || payment.createdAt))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const payouts = sources.payouts
    .filter((payout) => inRange(payout.createdAt || payout.period))
    .reduce((sum, payout) => sum + Number(payout.amount || 0), 0);

  const total = direct + payouts;

  return { direct, payouts, total };
}

export function getMonthBuckets(start: Date, end: Date): Array<{ start: Date; end: Date; label: string }> {
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endCursor) {
    const { start: monthStart, end: monthEnd } = getMonthRange(cursor);
    const label = cursor.toLocaleString("default", { month: "short", year: "numeric" });
    buckets.push({ start: monthStart, end: monthEnd, label });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets;
}

export async function computeAirbnbMonthlyRevenue(
  db: Db,
  ownerId: string,
  date: Date = new Date()
): Promise<AirbnbRevenueBreakdown> {
  const { start, end } = getMonthRange(date);
  const sources = await fetchAirbnbRevenueSources(db, ownerId);
  return sumAirbnbRevenueForRange(sources, start, end);
}

export type AirbnbListingRevenue = {
  listingId: string;
  listingName: string;
  revenue: number;
  direct: number;
  payouts: number;
  bookingTotal: number;
};

export async function computeAirbnbListingRevenue(
  db: Db,
  ownerId: string,
  start: Date,
  end: Date
): Promise<AirbnbListingRevenue[]> {
  const listings = await db
    .collection("airbnbListings")
    .find({ ownerId })
    .project({ externalId: 1, name: 1 })
    .toArray();

  const listingNameMap = new Map<string, string>();
  const listingAliasMap = new Map<string, string>();
  listings.forEach((listing: any) => {
    const internalId = listing._id?.toString?.() || "";
    const externalId = listing.externalId || "";
    const canonicalId = externalId || internalId;
    if (!canonicalId) return;
    const name = listing.name || "Airbnb Listing";
    listingNameMap.set(canonicalId, name);
    if (externalId) {
      listingAliasMap.set(externalId, canonicalId);
    }
    if (internalId) {
      listingAliasMap.set(internalId, canonicalId);
    }
  });

  const bookings = await db
    .collection("airbnbBookings")
    .find({ ownerId, status: { $ne: "cancelled" } })
    .toArray();

  const directPayments = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect", status: "completed" })
    .toArray();

  const payouts = await db
    .collection("airbnbPayouts")
    .find({ ownerId, status: "paid" })
    .toArray();

  const inRange = (value?: string | Date | null) => {
    const parsed = parseDate(value || null);
    return parsed && parsed >= start && parsed <= end;
  };

  const normalizeListingId = (rawId?: string) => {
    if (!rawId) return "";
    return listingAliasMap.get(rawId) || rawId;
  };

  const bookingTotals = new Map<string, number>();
  bookings.forEach((booking: any) => {
    if (!inRange(booking.checkIn)) return;
    const listingId = normalizeListingId(booking.listingId || booking.listingExternalId || "");
    if (!listingId) return;
    const next = (bookingTotals.get(listingId) || 0) + Number(booking.total || 0);
    bookingTotals.set(listingId, next);
  });

  const directTotals = new Map<string, number>();
  directPayments.forEach((payment: any) => {
    if (!inRange(payment.paymentDate || payment.createdAt)) return;
    const listingId = normalizeListingId(payment.propertyId || payment.listingId || "");
    if (!listingId) return;
    const next = (directTotals.get(listingId) || 0) + Number(payment.amount || 0);
    directTotals.set(listingId, next);
  });

  const payoutTotal = payouts
    .filter((payout: any) => inRange(payout.createdAt || payout.period))
    .reduce((sum: number, payout: any) => sum + Number(payout.amount || 0), 0);

  const totalBooking = Array.from(bookingTotals.values()).reduce((sum, value) => sum + value, 0);
  const totalDirect = Array.from(directTotals.values()).reduce((sum, value) => sum + value, 0);

  let allocationBasis = totalBooking > 0 ? bookingTotals : totalDirect > 0 ? directTotals : null;
  let allocationTotal = totalBooking > 0 ? totalBooking : totalDirect > 0 ? totalDirect : 0;

  const listingIds = new Set<string>([
    ...listingNameMap.keys(),
    ...bookingTotals.keys(),
    ...directTotals.keys(),
  ]);

  if (!allocationBasis && payoutTotal > 0 && listingIds.size > 0) {
    allocationBasis = new Map<string, number>();
    listingIds.forEach((listingId) => allocationBasis!.set(listingId, 1));
    allocationTotal = listingIds.size;
  }

  return Array.from(listingIds).map((listingId) => {
    const bookingTotal = bookingTotals.get(listingId) || 0;
    const direct = directTotals.get(listingId) || 0;
    const allocationShare = allocationBasis && allocationTotal > 0
      ? (allocationBasis.get(listingId) || 0) / allocationTotal
      : 0;
    const payoutsShare = payoutTotal * allocationShare;
    const revenue = direct + payoutsShare;
    const listingName = listingNameMap.get(listingId) || "Airbnb Listing";

    return {
      listingId,
      listingName,
      revenue,
      direct,
      payouts: payoutsShare,
      bookingTotal,
    };
  });
}

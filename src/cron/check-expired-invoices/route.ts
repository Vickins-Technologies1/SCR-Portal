// cron/generate-monthly-invoices.ts
import { connectToDatabase } from "@/lib/mongodb";
import { computeExpectedMonthlyIncome, getBillingMonth, getGracePeriodEndDate, resolveBillingPlan, SOFTWARE_LEASING_PERCENT, upsertPercentageInvoice } from "@/lib/billing";
import { AIRBNB_BOOKING_INVOICE_PERCENT } from "@/lib/airbnb-billing";
import { parseDate, startOfDay } from "@/lib/airbnb-utils";
import { Property } from "@/types/property";
import { Db, ObjectId } from "mongodb";

interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  status: string;
  createdAt?: Date;
  billingMonth?: string;
  billingPlan?: string;
}

const parseBillingMonth = (billingMonth?: string): Date | null => {
  if (!billingMonth) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 15);
};

const monthDiff = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

const toMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 15);

const addMonthlyAnniversary = (base: Date, monthsToAdd: number): Date => {
  const desiredDay = base.getDate();
  const desiredHour = base.getHours();
  const desiredMinute = base.getMinutes();
  const desiredSecond = base.getSeconds();
  const desiredMs = base.getMilliseconds();

  const nextMonth = new Date(base.getFullYear(), base.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const day = Math.min(desiredDay, lastDay);

  return new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    day,
    desiredHour,
    desiredMinute,
    desiredSecond,
    desiredMs
  );
};

const fmtRange = (start: Date, end: Date) => {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
};

export async function generateAirbnbInvoicesForOwner(params: {
  db: Db;
  ownerId: string;
  now?: Date;
}) {
  const { db, ownerId } = params;
  const now = params.now ?? new Date();
  const invoicesCollection = db.collection<Invoice>("invoices");

  let monthsConsidered = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let skippedExisting = 0;

  const listings = await db
    .collection("airbnbListings")
    .find({ ownerId })
    .project({ externalId: 1, name: 1, createdAt: 1, updatedAt: 1 })
    .toArray();

  if (listings.length === 0) {
    return { monthsConsidered, created, updated, skipped, skippedExisting };
  }

  for (const listing of listings as any[]) {
    const listingId = String(listing.externalId || listing._id?.toString?.() || "").trim();
    if (!listingId) continue;

    const listingName = String(listing.name || "Airbnb Listing");
    const listingCreatedAt =
      parseDate(listing.createdAt || null) ||
      parseDate(listing.updatedAt || null);

    if (!listingCreatedAt) continue;
    const listingAnchor = startOfDay(listingCreatedAt);

    const lastInvoice = await invoicesCollection
      .find({ userId: ownerId, propertyId: listingId, billingPlan: "Airbnb", status: { $ne: "failed" } })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    const lastGeneratedAt =
      parseBillingMonth(lastInvoice?.billingMonth) ||
      (lastInvoice?.createdAt ? new Date(lastInvoice.createdAt) : null);

    const maxCycles = Math.max(0, monthDiff(toMonthStart(listingAnchor), toMonthStart(now)) + 2);
    const startCycleIndex = lastGeneratedAt
      ? Math.max(0, monthDiff(toMonthStart(listingAnchor), toMonthStart(lastGeneratedAt)) - 1)
      : 0;

    for (let cycleIndex = startCycleIndex; cycleIndex < maxCycles; cycleIndex++) {
      const cycleStart = addMonthlyAnniversary(listingAnchor, cycleIndex);
      const cycleEnd = addMonthlyAnniversary(listingAnchor, cycleIndex + 1);

      if (cycleEnd > now) break;

      const billingMonth = getBillingMonth(cycleEnd);

      const existing = await invoicesCollection.findOne({
        userId: ownerId,
        propertyId: listingId,
        billingPlan: "Airbnb",
        billingMonth,
        status: { $ne: "failed" },
      });

      if (existing && !["pending", "unpaid", "overdue"].includes(String(existing.status || ""))) {
        skippedExisting += 1;
        continue;
      }

      monthsConsidered += 1;

      const cycleStartIso = cycleStart.toISOString();
      const cycleEndIso = cycleEnd.toISOString();

      const [bookingAgg] = await db
        .collection("airbnbBookings")
        .aggregate<{ total: number }>([
          {
            $match: {
              ownerId,
              status: { $ne: "cancelled" },
              $or: [{ listingId }, { listingExternalId: listingId }],
              checkIn: { $gte: cycleStartIso, $lt: cycleEndIso },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $toDouble: "$total" } },
            },
          },
        ])
        .toArray();

      const bookingTotal = Number(bookingAgg?.total || 0);
      const dueDate = getGracePeriodEndDate(listingAnchor, cycleEnd);
      const description = `Airbnb management fee (${AIRBNB_BOOKING_INVOICE_PERCENT}% of bookings Ksh ${bookingTotal.toFixed(2)}) for ${listingName} • ${fmtRange(cycleStart, cycleEnd)}`;

      const result = await upsertPercentageInvoice({
        db,
        userId: ownerId,
        propertyId: listingId,
        billingPlan: "Airbnb",
        percentage: AIRBNB_BOOKING_INVOICE_PERCENT,
        expectedIncome: bookingTotal,
        description,
        expiresAt: dueDate,
        now: cycleEnd,
        metadata: {
          billingPeriodStart: cycleStart.toISOString(),
          billingPeriodEnd: cycleEnd.toISOString(),
          bookingTotal,
          listingName,
          invoiceKind: "airbnb_booking_commission",
        },
      });

      if (result.action === "created") created += 1;
      if (result.action === "updated") updated += 1;
      if (result.action === "skipped") skipped += 1;
    }
  }

  return { monthsConsidered, created, updated, skipped, skippedExisting };
}

export default async function generateMonthlyInvoices() {
  const now = new Date();
  console.log("Starting monthly invoice generation job...", now.toISOString());

  try {
    const { db } = await connectToDatabase();
    const invoicesCollection = db.collection<Invoice>("invoices");
    const properties = await db.collection<Property>("properties").find({}).toArray();

    let propertiesChecked = 0;
    let monthsConsidered = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let skippedExisting = 0;

    let airbnbOwnersChecked = 0;
    let airbnbMonthsConsidered = 0;
    let airbnbCreated = 0;
    let airbnbUpdated = 0;
    let airbnbSkipped = 0;
    let airbnbSkippedExisting = 0;

    for (const property of properties) {
      const billingPlan = resolveBillingPlan(property);
      if (billingPlan !== "RentCollection") continue;

      propertiesChecked += 1;

      const propertyId = property._id.toString();
      const ownerId = typeof property.ownerId === "string" ? property.ownerId : property.ownerId?.toString?.() ?? String(property.ownerId);

      const lastInvoice = await invoicesCollection
        .find({ userId: ownerId, propertyId })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();

      const lastGeneratedAt =
        parseBillingMonth(lastInvoice?.billingMonth) ||
        (lastInvoice?.createdAt ? new Date(lastInvoice.createdAt) : null) ||
        (property.createdAt ? new Date(property.createdAt) : null);

      if (!lastGeneratedAt) continue;

      const monthsBehind = monthDiff(toMonthStart(lastGeneratedAt), toMonthStart(now));
      if (monthsBehind <= 0) continue;

      for (let i = 1; i <= monthsBehind; i++) {
        const targetDate = addMonths(lastGeneratedAt, i);
        const billingMonth = getBillingMonth(targetDate);
        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

        const existingForMonth = await invoicesCollection.findOne({
          userId: ownerId,
          propertyId,
          $or: [
            { billingMonth },
            { createdAt: { $gte: monthStart, $lt: monthEnd } },
          ],
        });

        if (existingForMonth) {
          skippedExisting += 1;
          continue;
        }

        monthsConsidered += 1;

        const expectedIncome = await computeExpectedMonthlyIncome(db, propertyId, targetDate);
        const dueDate = getGracePeriodEndDate(property.createdAt ? new Date(property.createdAt) : targetDate, targetDate);
        const description = `Software leasing fee (${SOFTWARE_LEASING_PERCENT}% of expected monthly income Ksh ${expectedIncome.toFixed(2)}) for ${targetDate.toLocaleString("default", { month: "long", year: "numeric" })}`;

        const result = await upsertPercentageInvoice({
          db,
          userId: ownerId,
          propertyId,
          billingPlan: "RentCollection",
          percentage: SOFTWARE_LEASING_PERCENT,
          expectedIncome,
          description,
          expiresAt: dueDate,
          now: targetDate,
        });

        if (result.action === "created") created += 1;
        if (result.action === "updated") updated += 1;
        if (result.action === "skipped") skipped += 1;
      }
    }

    const airbnbOwnerIds = new Set<string>([
      ...(await db.collection("airbnbListings").distinct("ownerId")),
      ...(await db.collection("airbnbBookings").distinct("ownerId")),
      ...(await db.collection("payments").distinct("ownerId", { type: "AirbnbDirect" })),
      ...(await db.collection("airbnbPayouts").distinct("ownerId")),
    ].map((id) => (id != null ? String(id) : "")).filter((id) => id.length > 0));

    for (const ownerId of airbnbOwnerIds) {
      if (!ObjectId.isValid(ownerId)) continue;

      airbnbOwnersChecked += 1;

      const result = await generateAirbnbInvoicesForOwner({ db, ownerId, now });
      airbnbMonthsConsidered += result.monthsConsidered;
      airbnbCreated += result.created;
      airbnbUpdated += result.updated;
      airbnbSkipped += result.skipped;
      airbnbSkippedExisting += result.skippedExisting;
    }

    console.log(
      `Monthly invoice generation completed: properties=${propertiesChecked}, monthsChecked=${monthsConsidered}, created=${created}, updated=${updated}, skipped=${skipped}, skippedExisting=${skippedExisting}.`
    );
    console.log(
      `Airbnb invoice generation completed: owners=${airbnbOwnersChecked}, monthsChecked=${airbnbMonthsConsidered}, created=${airbnbCreated}, updated=${airbnbUpdated}, skipped=${airbnbSkipped}, skippedExisting=${airbnbSkippedExisting}.`
    );
  } catch (error) {
    console.error("Critical error in monthly invoice generation", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// Allow direct execution for local testing
if (require.main === module) {
  generateMonthlyInvoices().then(() => process.exit(0));
}

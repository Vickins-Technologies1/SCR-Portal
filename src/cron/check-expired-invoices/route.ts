// cron/generate-monthly-invoices.ts
import { connectToDatabase } from "@/lib/mongodb";
import { computeExpectedMonthlyIncome, getBillingMonth, getGracePeriodEndDate, resolveBillingPlan, SOFTWARE_LEASING_PERCENT, upsertPercentageInvoice } from "@/lib/billing";
import { Property } from "@/types/property";
import { ObjectId } from "mongodb";

interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  status: "pending" | "completed" | "failed";
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

    console.log(
      `Monthly invoice generation completed: properties=${propertiesChecked}, monthsChecked=${monthsConsidered}, created=${created}, updated=${updated}, skipped=${skipped}, skippedExisting=${skippedExisting}.`
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

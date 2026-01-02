// cron/generate-monthly-invoices.ts
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
}

// Configuration
const INVOICE_EXPIRY_DAYS = 30; // Invoice valid for 30 days
const BATCH_SIZE = 50;

export default async function generateMonthlyInvoices() {
  console.log("Starting monthly invoice generation job...", new Date().toISOString());

  try {
    const { db } = await connectToDatabase();
    const invoicesCollection = db.collection<Invoice>("invoices");

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - INVOICE_EXPIRY_DAYS);

    let processed = 0;
    let created = 0;

    // Find all pending invoices that were created more than 30 days ago (i.e., expired)
    // This assumes you want to renew monthly recurring charges
    const expiredPendingCursor = invoicesCollection.find({
      status: "pending",
      createdAt: { $lt: thirtyDaysAgo }, // Older than 30 days
    });

    // To avoid duplicates, we'll track (userId, propertyId) pairs we've already processed in this run
    const processedKeys = new Set<string>();

    while (await expiredPendingCursor.hasNext()) {
      const oldInvoice = await expiredPendingCursor.next();
      if (!oldInvoice) continue;

      const key = `${oldInvoice.userId}-${oldInvoice.propertyId}`;

      // Skip if we already created a new invoice for this user/property in this batch
      if (processedKeys.has(key)) {
        continue;
      }

      // Double-check: is there already a newer pending invoice for this user/property?
      const existingNewerPending = await invoicesCollection.findOne({
        userId: oldInvoice.userId,
        propertyId: oldInvoice.propertyId,
        status: "pending",
        createdAt: { $gte: thirtyDaysAgo },
      });

      if (existingNewerPending) {
        // There's already a recent pending invoice → no need to create another
        processedKeys.add(key);
        continue;
      }

      // Generate new invoice
      const newReference = `INV-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)
        .toUpperCase()}`;

      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + INVOICE_EXPIRY_DAYS);

      const newInvoice = {
        userId: oldInvoice.userId,
        propertyId: oldInvoice.propertyId,
        amount: oldInvoice.amount,
        status: "pending" as const,
        reference: newReference,
        description: oldInvoice.description || "Monthly recurring invoice",
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: newExpiresAt,
      };

      try {
        const result = await invoicesCollection.insertOne(newInvoice as any);

        if (result.insertedId) {
          console.log(`Created new monthly invoice`, {
            userId: oldInvoice.userId,
            propertyId: oldInvoice.propertyId,
            amount: oldInvoice.amount,
            newReference,
            newId: result.insertedId.toString(),
            oldId: oldInvoice._id.toString(),
          });
          created++;
          processedKeys.add(key); // Mark as processed
        }
      } catch (err) {
        console.error("Failed to create new monthly invoice", {
          userId: oldInvoice.userId,
          propertyId: oldInvoice.propertyId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      processed++;
    }

    await expiredPendingCursor.close();

    console.log(
      `Monthly invoice generation completed: Checked ${processed} expired pending invoices, created ${created} new monthly invoices.`
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
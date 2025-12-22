// cron/check-expired-invoices.ts
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
const INVOICE_EXPIRY_DAYS = 30; // New invoice expires in 30 days
const BATCH_SIZE = 50; // Process in batches for safety

export default async function checkAndRenewExpiredInvoices() {
  console.log("Starting expired invoice renewal job...", new Date().toISOString());

  try {
    const { db } = await connectToDatabase();
    const invoicesCollection = db.collection<Invoice>("invoices");

    const now = new Date();

    let processed = 0;
    let renewed = 0;

    const cursor = invoicesCollection.find({
      status: "pending",
      expiresAt: { $lt: now },
    });

    let batch: Invoice[] = [];

    while (await cursor.hasNext()) {
      const invoice = await cursor.next();
      if (!invoice) continue;

      batch.push(invoice);

      if (batch.length >= BATCH_SIZE || !(await cursor.hasNext())) {
        for (const oldInvoice of batch) {
          try {
            // Generate unique reference
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
              description: oldInvoice.description || "Renewed invoice (auto-generated)",
              createdAt: new Date(),
              updatedAt: new Date(),
              expiresAt: newExpiresAt,
            };

            const result = await invoicesCollection.insertOne(newInvoice as any);

            if (result.insertedId) {
              console.log(`Renewed expired invoice`, {
                oldId: oldInvoice._id.toString(),
                newId: result.insertedId.toString(),
                userId: oldInvoice.userId,
                propertyId: oldInvoice.propertyId,
                amount: oldInvoice.amount,
                newExpiresAt: newExpiresAt.toISOString(),
              });
              renewed++;
            }
          } catch (err) {
            console.error("Failed to renew one invoice", {
              oldId: oldInvoice._id.toString(),
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        processed += batch.length;
        batch = [];
      }
    }

    await cursor.close();

    console.log(
      `Expired invoice renewal job completed: Processed ${processed} expired invoices, created ${renewed} new ones.`
    );
  } catch (error) {
    console.error("Critical error in renewal cron job", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// Allow direct execution for local testing
if (require.main === module) {
  checkAndRenewExpiredInvoices().then(() => process.exit(0));
}
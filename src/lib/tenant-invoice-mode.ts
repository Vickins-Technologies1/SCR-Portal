import { Db } from "mongodb";
import { identityValues } from "./payment-query";

/** Owners who opted into tenant invoices use invoice delivery instead of rent reminders. */
export async function getTenantInvoiceEnabledOwnerIds(db: Db, ownerIds: Iterable<unknown>) {
  const ownerValues = Array.from(new Set(Array.from(ownerIds, (value) => String(value || "").trim()).filter(Boolean)));
  if (!ownerValues.length) return new Set<string>();

  const settings = await db.collection("landlordBillingSettings")
    .find({ invoicingEnabled: true, landlordId: { $in: ownerValues.flatMap(identityValues) } })
    .project({ landlordId: 1 })
    .toArray();

  return new Set(settings.map((setting: any) => String(setting.landlordId || "").trim()).filter(Boolean));
}

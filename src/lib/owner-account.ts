import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

export type OwnerAccountStatus = "active" | "suspended";

export async function getOwnerAccountStatus(db: Db, ownerId: string) {
  if (!ObjectId.isValid(ownerId)) return null;
  const owner = await db.collection("propertyOwners").findOne(
    { _id: new ObjectId(ownerId), role: "propertyOwner" },
    { projection: { accountStatus: 1, suspensionReason: 1 } }
  );
  if (!owner) return null;
  return {
    status: (owner.accountStatus === "suspended" ? "suspended" : "active") as OwnerAccountStatus,
    reason: typeof owner.suspensionReason === "string" ? owner.suspensionReason : null,
  };
}

export async function assertOwnerActive(db: Db, ownerId: string) {
  const account = await getOwnerAccountStatus(db, ownerId);
  if (account?.status === "suspended") {
    return { active: false as const, response: { code: "ACCOUNT_SUSPENDED", message: "Your account has been suspended by an administrator. Please contact support for assistance." } };
  }
  return { active: true as const };
}

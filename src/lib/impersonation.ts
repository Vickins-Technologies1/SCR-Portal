import { Db, ObjectId } from "mongodb";

type TenantContext = {
  tenantId: string;
  isImpersonating: boolean;
};

type ResolveTenantContextInput = {
  db: Db;
  userId?: string;
  role?: string;
  isImpersonating: boolean;
  impersonatingTenantId?: string;
};

export async function resolveTenantContext({
  db,
  userId,
  role,
  isImpersonating,
  impersonatingTenantId,
}: ResolveTenantContextInput): Promise<TenantContext | null> {
  if (!userId || !role) return null;

  if (role === "tenant") {
    return { tenantId: userId, isImpersonating: false };
  }

  if (
    role === "propertyOwner" &&
    isImpersonating &&
    impersonatingTenantId &&
    ObjectId.isValid(impersonatingTenantId)
  ) {
    const tenant = await db.collection("tenants").findOne({
      _id: new ObjectId(impersonatingTenantId),
      ownerId: userId,
    });

    if (!tenant) return null;

    return { tenantId: impersonatingTenantId, isImpersonating: true };
  }

  return null;
}

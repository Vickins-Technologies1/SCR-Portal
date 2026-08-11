import type { ObjectId } from "mongodb";

const OWNER_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function validateOwnerPassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!OWNER_PASSWORD_REGEX.test(password)) {
    return "Password must contain uppercase, lowercase, number, and special character.";
  }
  return null;
}

export function buildSafeOwnerResponse(owner: any) {
  if (!owner) return null;

  return {
    _id: owner._id?.toString?.() ?? String(owner._id ?? ""),
    name: owner.name ?? "",
    email: owner.email ?? "",
    phone: owner.phone ?? "",
    role: owner.role ?? "propertyOwner",
    managementType: owner.managementType ?? "rentals",
    tier: owner.tier ?? undefined,
    isApproved: Boolean(owner.isApproved),
    approvedAt: toIsoString(owner.approvedAt),
    createdAt: toIsoString(owner.createdAt),
    updatedAt: toIsoString(owner.updatedAt),
  };
}


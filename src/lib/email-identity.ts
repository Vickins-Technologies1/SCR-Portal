import sanitizeHtml from "sanitize-html";
import type { Db } from "mongodb";

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value.trim().toLowerCase(), { allowedTags: [], allowedAttributes: {} }).trim();
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isDuplicateKeyError(error: unknown, fields: string[] = ["email"]): boolean {
  if (!error || typeof error !== "object") return false;
  const anyError = error as { code?: number; keyPattern?: Record<string, unknown>; errmsg?: string; message?: string };
  if (anyError.code !== 11000) return false;

  if (!anyError.keyPattern) return true;
  return fields.some((field) => Object.prototype.hasOwnProperty.call(anyError.keyPattern, field));
}

export async function findAnyExistingEmail(
  db: Db,
  email: string,
  options?: {
    collections?: string[];
    excludeId?: string | null;
  }
): Promise<{ collection: string; doc: any } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const collections = options?.collections || ["propertyOwners", "users", "tenants", "teamMembers", "adminTeamMembers"];
  const regex = new RegExp(`^${escapeRegex(normalized)}$`, "i");
  const excludeId = typeof options?.excludeId === "string" && options.excludeId.trim() ? options.excludeId.trim() : null;

  for (const collection of collections) {
    const match = await db.collection(collection).findOne({ email: regex } as any);
    if (!match) continue;
    if (excludeId && String((match as any)._id ?? "") === excludeId) continue;
    return { collection, doc: match };
  }

  return null;
}

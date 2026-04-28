import { ObjectId } from "mongodb";

export type ListingStatus = "draft" | "published" | "paused";

export function normalizeListingStatus(value: unknown): ListingStatus {
  if (typeof value !== "string") return "draft";
  const normalized = value.trim().toLowerCase();
  if (normalized === "active") return "published";
  if (normalized === "published" || normalized === "paused" || normalized === "draft") return normalized;
  return "draft";
}

export function buildListingIdFilter(ownerId: string, listingId: string) {
  const or: any[] = [{ externalId: listingId }, { _id: listingId }];
  if (ObjectId.isValid(listingId)) {
    or.unshift({ _id: new ObjectId(listingId) });
  }
  return { ownerId, $or: or };
}


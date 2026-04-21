export function pickListingContactPhone(listing: unknown): string | undefined {
  if (!listing || typeof listing !== "object") return undefined;

  const value = listing as any;
  const candidates = [
    value?.contactPhone,
    value?.ownerPhone,
    value?.owner?.phone,
    value?.contact?.phone,
    value?.phone,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}


export type AccountTier = "free" | "premium";

export function normalizeAccountTier(value: unknown): AccountTier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "free" || normalized === "premium") return normalized;
  return null;
}

export function resolveAccountTier(value: unknown, fallback: AccountTier = "premium"): AccountTier {
  return normalizeAccountTier(value) ?? fallback;
}

export function isPremiumTier(tier: unknown): boolean {
  return resolveAccountTier(tier, "premium") === "premium";
}


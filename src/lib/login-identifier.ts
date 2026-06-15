const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeLoginIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildPhoneVariants(identifier: string): string[] {
  const digits = identifier.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return [];

  const variants = new Set<string>([digits]);

  // Support the common Kenyan forms used elsewhere in the app:
  // 07XXXXXXXX, 7XXXXXXXX, and 2547XXXXXXXX.
  if (digits.length === 10 && digits.startsWith("0")) {
    variants.add(`254${digits.slice(1)}`);
  }
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) {
    variants.add(`0${digits}`);
    variants.add(`254${digits}`);
  }
  if (digits.length === 12 && digits.startsWith("254")) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(digits.slice(3));
  }

  return [...variants];
}

function buildPhoneRegexes(identifier: string): RegExp[] {
  return buildPhoneVariants(identifier).map((digits) => {
    const pattern = digits.split("").map((digit) => `\\D*${escapeRegex(digit)}`).join("");
    return new RegExp(`^\\D*${pattern}\\D*$`, "i");
  });
}

export function buildLoginIdentifierQuery(identifier: unknown):
  | { emailRegex: RegExp; phoneRegexes?: never }
  | { phoneRegexes: RegExp[]; emailRegex?: never }
  | null {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) return null;

  if (normalized.includes("@")) {
    return { emailRegex: new RegExp(`^${escapeRegex(normalized)}$`, "i") };
  }

  const phoneRegexes = buildPhoneRegexes(normalized);
  if (phoneRegexes.length > 0) {
    return { phoneRegexes };
  }

  return { emailRegex: new RegExp(`^${escapeRegex(normalized)}$`, "i") };
}

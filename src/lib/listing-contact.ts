export function normalizeWhatsAppPhone(phone: string | undefined | null): string | undefined {
  if (typeof phone !== "string") return undefined;

  const cleaned = phone.replace(/[^\d+]/g, "").trim();
  let digits = cleaned.replace(/\+/g, "");

  if (digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  } else if (digits.startsWith("7") || digits.startsWith("1")) {
    digits = `254${digits}`;
  }

  if (!/^\d{8,15}$/.test(digits)) return undefined;
  return digits;
}

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

export function buildWhatsAppLink(phone: string | undefined | null, message: string, preferWeb = false): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;

  const encodedMessage = encodeURIComponent(message);
  if (preferWeb) {
    return `https://web.whatsapp.com/send?phone=${normalized}&text=${encodedMessage}`;
  }

  return `https://wa.me/${normalized}?text=${encodedMessage}`;
}

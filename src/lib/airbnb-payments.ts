export function buildAirbnbPaymentReference(bookingId: string): string {
  const trimmed = bookingId.trim();
  return trimmed.startsWith("ABNB-") ? trimmed : `ABNB-${trimmed}`;
}

export function parseAirbnbPaymentReference(reference: string): string | null {
  if (!reference) return null;
  if (!reference.startsWith("ABNB-")) return null;
  const value = reference.replace(/^ABNB-/, "").trim();
  return value || null;
}

export function normalizeAirbnbPaymentStatus(status: string | null | undefined): "pending" | "paid" | "failed" {
  const normalized = (status || "").toLowerCase();
  if (["completed", "paid", "success"].includes(normalized)) return "paid";
  if (["failed", "cancelled", "canceled"].includes(normalized)) return "failed";
  return "pending";
}

export function calculateAdr(totalRevenue: number, bookedNights: number): number {
  if (!Number.isFinite(totalRevenue) || !Number.isFinite(bookedNights) || bookedNights <= 0) {
    return 0;
  }
  return Math.round(totalRevenue / bookedNights);
}

export function calculateRevpar(totalRevenue: number, availableNights: number): number {
  if (!Number.isFinite(totalRevenue) || !Number.isFinite(availableNights) || availableNights <= 0) {
    return 0;
  }
  return Math.round(totalRevenue / availableNights);
}

export function calculateOccupancyRate(bookedNights: number, availableNights: number): number {
  if (!Number.isFinite(bookedNights) || !Number.isFinite(availableNights) || availableNights <= 0) {
    return 0;
  }
  const rate = (bookedNights / availableNights) * 100;
  return Math.max(0, Math.min(100, Math.round(rate)));
}

export function formatKes(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Ksh ${Math.max(0, Math.round(safe)).toLocaleString("en-US")}`;
}

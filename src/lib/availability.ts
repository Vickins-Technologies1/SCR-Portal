import { Listing, AvailabilitySummary } from "@/types/property";

export function ensureAvailability(listing: Listing): AvailabilitySummary {
  if (listing.availability) {
    return listing.availability;
  }

  const unitTypes = Array.isArray(listing.unitTypes) ? listing.unitTypes : [];
  const totalUnits = unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  const totalVacant = unitTypes.reduce((sum, unit) => sum + (unit.vacant ?? 0), 0);
  const totalOccupied = Math.max(0, totalUnits - totalVacant);
  const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  return { totalUnits, totalVacant, totalOccupied, occupancyRate };
}

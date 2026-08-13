import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getOccupancyByPropertyAndUnitType } from "@/lib/tenant-occupancy";
import type { AvailabilitySummary } from "@/types/property";

export interface PublicPropertyAvailabilityUnit {
  type: string;
  uniqueType: string;
  price: number;
  deposit: number;
  quantity: number;
  vacant: number;
  managementType: "RentCollection" | "FullManagement";
}

export interface PublicPropertyAvailability {
  _id: string;
  name: string;
  address: string;
  status: string;
  billingType?: "RentCollection" | "FullManagement";
  rentPaymentDate?: number;
  unitTypes: PublicPropertyAvailabilityUnit[];
  availability: AvailabilitySummary;
  hasVacancy: boolean;
  availabilityLabel: string;
  updatedAt?: string;
}

const toISO = (value?: Date | string | null): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const asNonNegativeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export async function getPublicPropertyAvailability(
  propertyId: string
): Promise<PublicPropertyAvailability | null> {
  const normalizedId = propertyId.trim();
  if (!normalizedId) return null;

  const { db } = await connectToDatabase();
  const queries: Array<Record<string, unknown>> = [];

  if (ObjectId.isValid(normalizedId)) {
    queries.push({ _id: new ObjectId(normalizedId) });
  }
  queries.push({ _id: normalizedId });

  let property: any = null;
  for (const query of queries) {
    property = await db.collection("properties").findOne(query as any);
    if (property) break;
  }

  if (!property) {
    return null;
  }

  const publicId = property._id?.toString?.() || normalizedId;
  const occupancyByProperty = await getOccupancyByPropertyAndUnitType(db, [publicId], new Date());
  const occupancy = occupancyByProperty[publicId] || { occupiedUnits: 0, occupiedByType: {} };
  const occupiedByType = occupancy.occupiedByType || {};
  const unitTypes = Array.isArray(property.unitTypes) ? property.unitTypes : [];

  const safeUnitTypes = unitTypes.map((unit: any, index: number) => {
    const type = typeof unit?.type === "string" && unit.type.trim() ? unit.type.trim() : `Unit ${index + 1}`;
    const uniqueType =
      typeof unit?.uniqueType === "string" && unit.uniqueType.trim()
        ? unit.uniqueType.trim()
        : `${type}-${index}`;
    const quantity = asNonNegativeNumber(unit?.quantity);
    const occupied = Math.min(
      quantity,
      asNonNegativeNumber(occupiedByType[uniqueType] ?? occupiedByType[type])
    );

    return {
      type,
      uniqueType,
      price: asNonNegativeNumber(unit?.price),
      deposit: asNonNegativeNumber(unit?.deposit),
      quantity,
      vacant: Math.max(0, quantity - occupied),
      managementType: unit?.managementType || property.billingType || "RentCollection",
    };
  });

  const totalUnits = safeUnitTypes.reduce((sum, unit) => sum + unit.quantity, 0);
  const totalVacant = safeUnitTypes.reduce((sum, unit) => sum + unit.vacant, 0);
  const totalOccupied = Math.max(0, totalUnits - totalVacant);
  const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;
  const isActive = String(property.status || "").toLowerCase() === "active";

  return {
    _id: publicId,
    name: property.name || "Property",
    address: property.address || "Address not provided",
    status: property.status || "Inactive",
    billingType: property.billingType || property.unitTypes?.[0]?.managementType || undefined,
    rentPaymentDate: Number.isFinite(Number(property.rentPaymentDate))
      ? Number(property.rentPaymentDate)
      : undefined,
    unitTypes: safeUnitTypes,
    availability: {
      totalUnits,
      totalVacant,
      totalOccupied,
      occupancyRate,
    },
    hasVacancy: totalVacant > 0,
    availabilityLabel: !isActive
      ? "Not currently active"
      : totalVacant > 0
        ? "Vacancies available"
        : "Fully occupied",
    updatedAt: toISO(property.updatedAt),
  };
}

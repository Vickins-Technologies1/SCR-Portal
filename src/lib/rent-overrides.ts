import { Db } from "mongodb";
import { RentPriceOverride } from "@/types/rent-price-override";

export const buildOverrideKey = (propertyId: string, unitType: string): string =>
  `${propertyId}::${unitType}`;

export const filterOverridesForUnit = (
  overrides: RentPriceOverride[],
  unitIdentifier?: string
): RentPriceOverride[] => {
  if (!overrides?.length) return [];
  if (!unitIdentifier) {
    return overrides.filter((override) => !override.unitIdentifier);
  }
  const specific = overrides.filter((override) => override.unitIdentifier === unitIdentifier);
  if (specific.length > 0) return specific;
  return overrides.filter((override) => !override.unitIdentifier);
};

export const fetchActiveRentOverridesByPropertyIds = async (
  db: Db,
  propertyIds: string[]
): Promise<Map<string, RentPriceOverride[]>> => {
  const map = new Map<string, RentPriceOverride[]>();
  if (!propertyIds.length) return map;

  const overrides = await db.collection<RentPriceOverride>("rentPriceOverrides").find({
    propertyId: { $in: propertyIds },
    status: { $ne: "inactive" },
  }).toArray();

  for (const override of overrides) {
    const propertyId = override.propertyId?.toString?.() ?? String(override.propertyId);
    const unitType = override.unitType;
    const key = buildOverrideKey(propertyId, unitType);
    const existing = map.get(key) ?? [];
    existing.push(override);
    map.set(key, existing);
  }

  return map;
};

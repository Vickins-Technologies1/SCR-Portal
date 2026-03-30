import { Db } from "mongodb";
import { RentPriceOverride } from "@/types/rent-price-override";

export const buildOverrideKey = (propertyId: string, unitType: string): string =>
  `${propertyId}::${unitType}`;

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

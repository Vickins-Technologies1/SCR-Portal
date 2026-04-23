import { Db, ObjectId } from "mongodb";
import { RentPriceOverride } from "@/types/rent-price-override";

export const buildOverrideKey = (propertyId: string, unitType: string): string =>
  `${propertyId}::${unitType}`;

export const filterOverridesForUnit = (
  overrides: RentPriceOverride[],
  unitIdentifier?: string
): RentPriceOverride[] => {
  if (!overrides?.length) return [];
  if (!unitIdentifier) {
    const generic = overrides.filter((override) => !override.unitIdentifier);
    if (generic.length > 0) return generic;

    // Fallback for legacy tenants that don't have `unitIdentifier` populated:
    // if all overrides are for exactly one unitIdentifier, treat them as applicable.
    const identifiers = Array.from(
      new Set(
        overrides
          .map((override) => (override.unitIdentifier || "").trim())
          .filter((id) => Boolean(id))
      )
    );
    if (identifiers.length === 1) {
      return overrides.filter((override) => override.unitIdentifier === identifiers[0]);
    }

    return [];
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

  const uniquePropertyIds = Array.from(new Set(propertyIds.map((id) => String(id))));
  const objectIdCandidates = uniquePropertyIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  const propertyIdCandidates: (string | ObjectId)[] = [...uniquePropertyIds, ...objectIdCandidates];

  const overrides = await db.collection<RentPriceOverride>("rentPriceOverrides").find({
    // `propertyId` is stored as a string in new data, but may be an ObjectId in legacy records.
    propertyId: { $in: propertyIdCandidates as any[] },
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

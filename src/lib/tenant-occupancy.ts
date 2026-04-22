import { Db, ObjectId, type Document } from "mongodb";

export const NON_OCCUPYING_TENANT_STATUSES: ReadonlyArray<string> = [
  "terminated",
  "inactive",
  "moved out",
  "evicted",
];

export const countOccupiedUnitsForTenant = (tenant: { leasedUnits?: unknown } | null | undefined): number => {
  if (!tenant) return 0;
  const leasedUnits = (tenant as any).leasedUnits;
  if (Array.isArray(leasedUnits) && leasedUnits.length > 0) return leasedUnits.length;
  return 1;
};

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

const toObjectIdIfValid = (value: string): ObjectId | null => (ObjectId.isValid(value) ? new ObjectId(value) : null);

export const buildPropertyIdCandidates = (propertyIds: string[]): Array<string | ObjectId> => {
  const ids = unique(propertyIds.filter(Boolean));
  const objectIds = ids
    .map((id) => toObjectIdIfValid(id))
    .filter((id): id is ObjectId => Boolean(id));
  return unique([...ids, ...objectIds] as Array<string | ObjectId>);
};

const utcDayStart = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const convertToDate = (field: string) => ({
  $convert: {
    input: field,
    to: "date",
    onError: null,
    onNull: null,
  },
});

const buildActiveLeaseStages = (day: Date) => {
  const dayStart = utcDayStart(day);

  return [
    {
      $addFields: {
        _leaseStart: convertToDate("$leaseStartDate"),
        _leaseEnd: convertToDate("$leaseEndDate"),
      },
    },
    {
      $match: {
        _leaseStart: { $ne: null },
        _leaseEnd: { $ne: null },
      },
    },
    {
      $addFields: {
        _leaseStartDay: { $dateTrunc: { date: "$_leaseStart", unit: "day" } },
        _leaseEndDay: { $dateTrunc: { date: "$_leaseEnd", unit: "day" } },
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            { $lte: ["$_leaseStartDay", dayStart] },
            { $gte: ["$_leaseEndDay", dayStart] },
          ],
        },
      },
    },
  ] as const;
};

const buildOverlapStages = (rangeStart: Date, rangeEnd: Date) => {
  const startDay = utcDayStart(rangeStart);
  const endDay = utcDayStart(rangeEnd);

  return [
    {
      $addFields: {
        _leaseStart: convertToDate("$leaseStartDate"),
        _leaseEnd: convertToDate("$leaseEndDate"),
      },
    },
    {
      $match: {
        _leaseStart: { $ne: null },
        _leaseEnd: { $ne: null },
      },
    },
    {
      $addFields: {
        _leaseStartDay: { $dateTrunc: { date: "$_leaseStart", unit: "day" } },
        _leaseEndDay: { $dateTrunc: { date: "$_leaseEnd", unit: "day" } },
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            { $lte: ["$_leaseStartDay", endDay] },
            { $gte: ["$_leaseEndDay", startDay] },
          ],
        },
      },
    },
  ] as const;
};

const unitCountExpr = () => ({
  $let: {
    vars: {
      leasedUnitsArray: {
        $cond: [{ $isArray: "$leasedUnits" }, "$leasedUnits", []],
      },
    },
    in: {
      $cond: [
        { $gt: [{ $size: "$$leasedUnitsArray" }, 0] },
        { $size: "$$leasedUnitsArray" },
        1,
      ],
    },
  },
});

const unitTypesArrayExpr = () => ({
  $let: {
    vars: {
      leasedUnitsArray: {
        $cond: [{ $isArray: "$leasedUnits" }, "$leasedUnits", []],
      },
      fallbackType: { $ifNull: ["$unitType", "unknown"] },
    },
    in: {
      $cond: [
        { $gt: [{ $size: "$$leasedUnitsArray" }, 0] },
        {
          $map: {
            input: "$$leasedUnitsArray",
            as: "unit",
            in: {
              $ifNull: ["$$unit.unitType", "$$fallbackType"],
            },
          },
        },
        ["$$fallbackType"],
      ],
    },
  },
});

const tenantBaseStages = (propertyIds: string[]) => {
  const propertyIdCandidates = buildPropertyIdCandidates(propertyIds);
  const nonOccupyingLower = NON_OCCUPYING_TENANT_STATUSES.map((s) => s.toLowerCase());

  return [
    { $match: { propertyId: { $in: propertyIdCandidates as any } } },
    {
      $addFields: {
        _statusLower: {
          $toLower: { $ifNull: ["$status", ""] },
        },
      },
    },
    {
      $match: {
        _statusLower: { $nin: nonOccupyingLower },
      },
    },
  ] as const;
};

export async function fetchTenantsActiveOnDay<TTenant extends Document = Document>(
  db: Db,
  propertyIds: string[],
  day: Date,
  projection?: Record<string, 1 | 0>,
  excludeTenantId?: ObjectId
): Promise<TTenant[]> {
  if (propertyIds.length === 0) return [];

  const pipeline: any[] = [
    ...tenantBaseStages(propertyIds),
    ...(excludeTenantId ? [{ $match: { _id: { $ne: excludeTenantId } } }] : []),
    ...buildActiveLeaseStages(day),
  ];

  if (projection) {
    pipeline.push({ $project: projection });
  }

  return db.collection<TTenant>("tenants").aggregate<TTenant>(pipeline).toArray();
}

export async function fetchTenantsOverlappingRange<TTenant extends Document = Document>(
  db: Db,
  propertyIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
  projection?: Record<string, 1 | 0>
): Promise<TTenant[]> {
  if (propertyIds.length === 0) return [];

  const pipeline: any[] = [
    ...tenantBaseStages(propertyIds),
    ...buildOverlapStages(rangeStart, rangeEnd),
  ];

  if (projection) {
    pipeline.push({ $project: projection });
  }

  return db.collection<TTenant>("tenants").aggregate<TTenant>(pipeline).toArray();
}

export type OccupancyByProperty = {
  totalTenants: number;
  occupiedUnits: number;
  occupiedByType: Record<string, number>;
};

export async function getOccupancyByPropertyAndUnitType(
  db: Db,
  propertyIds: string[],
  day: Date
): Promise<Record<string, OccupancyByProperty>> {
  if (propertyIds.length === 0) return {};

  const pipeline: any[] = [
    ...tenantBaseStages(propertyIds),
    ...buildActiveLeaseStages(day),
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: { $toString: "$propertyId" },
              totalTenants: { $sum: 1 },
              occupiedUnits: { $sum: unitCountExpr() },
            },
          },
        ],
        byType: [
          {
            $project: {
              propertyId: { $toString: "$propertyId" },
              unitTypes: unitTypesArrayExpr(),
            },
          },
          { $unwind: "$unitTypes" },
          {
            $group: {
              _id: { propertyId: "$propertyId", unitType: "$unitTypes" },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ];

  const [result] = await db.collection("tenants").aggregate<any>(pipeline).toArray();
  const summaryRows: Array<{ _id: string; totalTenants: number; occupiedUnits: number }> = result?.summary || [];
  const typeRows: Array<{ _id: { propertyId: string; unitType: string }; count: number }> = result?.byType || [];

  const out: Record<string, OccupancyByProperty> = {};

  for (const row of summaryRows) {
    out[row._id] = {
      totalTenants: Number(row.totalTenants || 0),
      occupiedUnits: Number(row.occupiedUnits || 0),
      occupiedByType: {},
    };
  }

  for (const row of typeRows) {
    const propertyId = row._id?.propertyId;
    if (!propertyId) continue;
    if (!out[propertyId]) {
      out[propertyId] = { totalTenants: 0, occupiedUnits: 0, occupiedByType: {} };
    }
    const unitType = row._id?.unitType || "unknown";
    out[propertyId].occupiedByType[unitType] = Number(row.count || 0);
  }

  return out;
}

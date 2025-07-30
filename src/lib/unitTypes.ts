export const UNIT_TYPES = [
  {
    type: "Single",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 10 },
        { range: [21, 50], fee: 5000 },
        { range: [51, 100], fee: 8000 },
        { range: [101, Infinity], fee: 0 }, 
      ],
      FullManagement: 0, 
    },
  },
  {
    type: "Studio",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 10 },
        { range: [21, 50], fee: 5000 },
        { range: [51, 100], fee: 8000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "1-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "2-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "3-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Duplex",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Commercial",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
];

export function getManagementFee(unit: { type: string; managementType: "RentCollection" | "FullManagement"; quantity: number }): number {
  const unitType = UNIT_TYPES.find((ut) => ut.type === unit.type);
  if (!unitType) return 0;

  const pricing = unitType.pricing[unit.managementType];
  if (typeof pricing === "number") return pricing;

  for (const tier of pricing) {
    const [min, max] = tier.range;
    if (unit.quantity >= min && unit.quantity <= max) {
      return tier.fee;
    }
  }
  return 0; 
}
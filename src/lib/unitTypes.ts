// src/lib/unitTypes.ts
export const UNIT_TYPES = [
  {
    type: "Single",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 5000 },
        { range: [51, 100], fee: 8000 },
        { range: [101, Infinity], fee: "Call for pricing" },
      ],
      FullManagement: "Call for pricing",
    },
  },
  {
    type: "Studio",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 5000 },
        { range: [51, 100], fee: 8000 },
        { range: [101, Infinity], fee: "Call for pricing" },
      ],
      FullManagement: "Call for pricing",
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
      FullManagement: "Call for pricing",
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
      FullManagement: "Call for pricing",
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
      FullManagement: "Call for pricing",
    },
  },
  {
    type: "Penthouse",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: "Call for pricing",
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
      FullManagement: "Call for pricing",
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
      FullManagement: "Call for pricing",
    },
  },
];

export function getManagementFee(unit: { type: string; managementType: "RentCollection" | "FullManagement"; quantity: number }): number | string {
  const unitType = UNIT_TYPES.find((ut) => ut.type === unit.type);
  if (!unitType) return "Call for pricing";
  const pricing = unitType.pricing[unit.managementType];
  if (pricing === "Call for pricing") return "Call for pricing";
  if (Array.isArray(pricing)) {
    for (const tier of pricing) {
      const [min, max] = tier.range;
      if (unit.quantity >= min && unit.quantity <= max) {
        return tier.fee;
      }
    }
  }
  return "Call for pricing";
}
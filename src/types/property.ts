export interface UnitType {
  type: string;
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  managementFee: number; // Changed from string | number to number
  quantity: number;
}

export interface Property {
  _id: import("mongodb").ObjectId;
  ownerId: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  status: string;
  rentPaymentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
import { ObjectId } from "mongodb";

export interface UnitType {
  type: string;
  uniqueType: string;
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  quantity: number;
}

export interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  managementFee: number; // Added for property-wide management fee
  status: string;
  rentPaymentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
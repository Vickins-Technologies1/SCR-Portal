import { ObjectId } from "mongodb";

export interface UnitType {
  type: string;
  uniqueType?: string;
  price: number;
  deposit: number;
  managementType?: "RentCollection" | "FullManagement";
  quantity: number;
}

export interface Property {
  _id: ObjectId | string;
  ownerId: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  managementFee?: number;
  status: string;
  rentPaymentDate?: Date | string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}
// src/types/property.ts
import { ObjectId } from "mongodb";

export interface UnitType {
  type: string;
  uniqueType?: string; // Still optional
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement"; // Now required
  quantity: number;
  managementFee?: number;
}

export interface Property {
  _id: ObjectId | string;
  ownerId: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  managementFee?: number;
  status: string;
  rentPaymentDate?: number;
  createdAt: Date;
  updatedAt?: Date;
}
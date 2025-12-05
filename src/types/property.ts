// src/types/property.ts
import { ObjectId } from "mongodb";

export interface UnitType {
  type: string;
  uniqueType?: string;
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  quantity: number;
  managementFee?: number;
}

export interface Tenant {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
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
  tenants?: Tenant[];
}
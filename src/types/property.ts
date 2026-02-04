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

  // ───────────────────────────────────────────────────────────────
  //           NEW: per-property occupied units count
  //           (recommended — populate this in /api/properties)
  // ───────────────────────────────────────────────────────────────
  occupiedUnits?: number;

  // Optional: you can also include these if you want richer frontend display
  // without extra queries
  tenants?: Tenant[];                 // already present — good for small lists
  totalTenants?: number;              // optional summary count
  vacantUnits?: number;               // optional — can be derived, but useful
}
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
  vacant?: number; // Optional field to track vacancies in real-time
}

export interface AvailabilitySummary {
  totalUnits: number;
  totalVacant: number;
  totalOccupied: number;
  occupancyRate: number;
}

export interface Tenant {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
}

// ────────────────────────────────────────────────
// Core/internal Property (what you store/manage)
// ────────────────────────────────────────────────
export interface Property {
  _id: ObjectId | string;
  ownerId: ObjectId | string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  billingType?: "RentCollection" | "FullManagement";
  managementFee?: number;
  managementFeePercent?: number;
  status: string;
  rentPaymentDate?: number;
  createdAt: Date;
  updatedAt?: Date;

  // Recommended runtime-calculated or aggregated fields
  occupiedUnits?: number;
  tenants?: Tenant[];
  totalTenants?: number;
  vacantUnits?: number;
}

// ────────────────────────────────────────────────
// Listing (public-facing advertised property)
// Separate from core Property for clean separation of concerns
// ────────────────────────────────────────────────
export interface Listing {
  _id: string;
  originalPropertyId: string; // reference to the core Property
  ownerId: string;

  // Denormalized snapshot from Property at time of listing
  name: string;
  address: string;
  unitTypes: UnitType[];
  billingType?: "RentCollection" | "FullManagement";
  // Marketing-specific fields
  description?: string;
  facilities?: string[];
  images: string[]; // Independent from any core property images

  // Advertisement controls
  isAdvertised: boolean;
  adExpiration?: string; // ISO string

  // Status & timestamps
  status: "Active" | "Inactive" | "Expired";
  createdAt: string;
  updatedAt?: string;
  availability?: AvailabilitySummary;
}





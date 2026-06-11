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

export interface PropertyUtility {
  id: string;
  name: string;
  billingMode: "fixed" | "metered";
  amount: number;
  unitLabel?: string;
  startsAt?: string;
  active?: boolean;
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
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
  utilities?: PropertyUtility[];
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
  contactPhone?: string;

  // Advertisement controls
  isAdvertised: boolean;
  adExpiration?: string; // ISO string

  // Status & timestamps
  status: "Active" | "Inactive" | "Expired";
  createdAt: string;
  updatedAt?: string;
  availability?: AvailabilitySummary;
  rating?: number;
  reviewCount?: number;
}

// ────────────────────────────────────────────────
// Public Airbnb Listing (short-term stays)
// ────────────────────────────────────────────────
export interface AirbnbPublicListing {
  _id: string;
  ownerId: string;
  name: string;
  address: string;
  description?: string;
  amenities?: string[];
  houseRules?: string[];
  images?: string[];
  status: "published" | "paused" | "draft";
  baseRate: number;
  weekendRate: number;
  occupancyRate?: number;
  rating?: number;
  reviewCount?: number;
  units?: number;
  licenseStatus?: "valid" | "due" | "missing";
  createdAt: string;
  updatedAt?: string;
  listingType: "airbnb";
}

export type PublicRentalListing = Listing & { listingType: "rentals" };
export interface SalePublicListing {
  _id: string;
  ownerId?: string;
  name: string;
  address: string;
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  interiorSizeSqft?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  price: number;
  currency?: string;
  amenities?: string[];
  images?: string[];
  status: "published" | "draft" | "sold";
  createdAt: string;
  updatedAt?: string;
  isFeatured?: boolean;
  listingType: "sale";
  rating?: number;
  reviewCount?: number;
}

export type PublicListing = PublicRentalListing | AirbnbPublicListing | SalePublicListing;





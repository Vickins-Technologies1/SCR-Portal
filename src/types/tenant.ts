// src/types/tenant.ts
import { ObjectId } from "mongodb";

export interface Tenant {
  _id: ObjectId;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "tenant";
  propertyId: string;
  unitType: string;           // Display name: "1-Bedroom"
  unitIdentifier: string;     // Unique key: "1-Bedroom-0", "1-Bedroom-1"
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: "active" | "inactive" | "evicted";
  paymentStatus: "current" | "overdue" | "paid";
  createdAt: Date;
  updatedAt?: Date;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
  deliveryMethod: "sms" | "email" | "whatsapp" | "both" | "app";
}

export interface ResponseTenant {
  _id: string;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  role: "tenant";
  propertyId: string;
  unitType: string;
  unitIdentifier: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
  deliveryMethod?: "sms" | "email" | "whatsapp" | "both" | "app";
  dues?: {
    rentDues: number;
    utilityDues: number;
    depositDues: number;
    totalRemainingDues: number;
  };
}

export interface TenantRequest {
  name: string;
  email: string;
  phone: string;
  password?: string;
  propertyId: string;
  unitIdentifier: string;        // REQUIRED: uniqueType like "1-Bedroom-0"
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  price?: number;
  deposit?: number;
}
import { ObjectId } from "mongodb";

export interface Tenant {
  _id: ObjectId;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt?: Date;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
  deliveryMethod: "sms" | "email" | "whatsapp" | "both" | "app"; // Added "whatsapp"
}

export interface ResponseTenant {
  _id: string;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  propertyId: string;
  unitType: string;
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
  deliveryMethod?: "sms" | "email" | "whatsapp" | "both" | "app"; // Added for API responses
  dues?: {
    rentDues: number;
    utilityDues: number;
    depositDues: number;
    totalRemainingDues: number;
  };
}

export interface TenantRequest {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
  propertyId?: string;
  unitType?: string;
  price?: number;
  deposit?: number;
  houseNumber?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  status?: string;
  paymentStatus?: string;
  totalRentPaid?: number;
  totalUtilityPaid?: number;
  totalDepositPaid?: number;
  walletBalance?: number;
  ownerId?: string;
}
// src/types/tenant.ts
import { ObjectId } from 'mongodb';

export interface UnitType {
  type: string;
  quantity?: number; // Optional in TenantRequest, required in Property
  price: number;
  deposit: number;
}

export interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'tenant';
  ownerId: string;
  propertyId: ObjectId;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  walletBalance: number;
}

export interface TenantRequest {
  name: string;
  email: string;
  phone: string;
  password?: string; // Optional for updates
  role?: 'tenant'; // Optional, defaults to 'tenant'
  propertyId: string; // String in request, converted to ObjectId in DB
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status?: string;
  paymentStatus?: string;
  ownerId?: string;
  walletBalance?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  tenants?: T[];
  tenant?: T;
}
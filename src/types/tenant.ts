// src/types/tenant.ts
import { ObjectId } from 'mongodb';

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
  createdAt: Date;
  updatedAt?: Date;
  walletBalance: number;
}

export interface ResponseTenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: 'tenant';
  ownerId: string;
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
  walletBalance: number;
}

export interface TenantRequest {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: 'tenant';
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status?: string;
  paymentStatus?: string;
  walletBalance?: number;
  ownerId: string;
}

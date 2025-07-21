export interface TenantRequest {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role?: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  ownerId?: string;
  walletBalance?: number;
}

export interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
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
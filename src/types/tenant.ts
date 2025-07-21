export interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

export interface TenantRequest {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  ownerId: string;
}
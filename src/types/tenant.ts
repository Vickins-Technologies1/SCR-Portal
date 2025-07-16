export interface TenantRequest {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: string;
  ownerId: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
}

export interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}
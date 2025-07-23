import { ObjectId } from 'mongodb';

export interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
  managementType: 'RentCollection' | 'FullManagement';
  managementFee: number | string;
}

export interface Property {
  _id: ObjectId;
  name: string;
  address: string;
  ownerId: string;
  unitTypes: UnitType[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
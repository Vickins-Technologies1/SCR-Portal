import { ObjectId } from "mongodb";

export interface RentPriceOverride {
  _id?: ObjectId | string;
  ownerId: string;
  propertyId: string;
  unitType: string;
  unitIdentifier?: string;
  price: number;
  startDate: Date | string;
  endDate: Date | string;
  status?: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

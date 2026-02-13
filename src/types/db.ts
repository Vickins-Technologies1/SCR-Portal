// src/types/db.ts
import { ObjectId } from "mongodb";

export interface TeamMember {
  _id: string | ObjectId;
  ownerId: string | ObjectId;
  name: string;
  email: string;
  phone?: string;
  role: string;
  teamRole: string;          
  permissions: string[];
  password?: string;         
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActive?: string;
}

export interface Expense {
  _id?: ObjectId | string;
  ownerId: ObjectId | string;
  propertyId?: ObjectId | string | null;
  description: string;
  amount: number;
  category:
    | "maintenance"
    | "utilities"
    | "repairs"
    | "taxes"
    | "management"
    | "insurance"
    | "marketing"
    | "other";
  date: Date;
  receiptUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
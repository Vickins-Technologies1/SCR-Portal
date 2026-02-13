// src/types/db.ts
import { ObjectId } from "mongodb";

export interface TeamMember {
  _id?: string;
  ownerId: string | ObjectId;   // ← allow both           // ← links to the property owner who created them
  name: string;
  email: string;                // unique per owner
  phone?: string;
  role: "Co-Owner" | "Manager" | "Accountant" | "Assistant" | "Viewer";
  permissions: string[];
  password: string;             // hashed!
  active: boolean;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
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
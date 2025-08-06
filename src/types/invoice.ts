import { ObjectId } from "mongodb";

   export interface Invoice {
     _id: ObjectId;
     userId: string;
     propertyId: string;
     unitType: string;
     amount: number;
     status: "pending" | "completed" | "failed";
     reference: string;
     createdAt: Date;
     updatedAt: Date;
     expiresAt: Date;
     description: string;
   }
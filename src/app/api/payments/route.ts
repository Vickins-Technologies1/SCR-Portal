import { NextResponse } from "next/server";
   import { connectToDatabase } from "../../../lib/mongodb";

   export async function GET() {
     try {
       console.log("Handling GET request to /api/payments");
       const { db } = await connectToDatabase();
       const payments = await db
         .collection("payments")
         .find({ ownerId: "currentOwnerId" })
         .toArray();
       console.log("Payments fetched:", payments);
       return NextResponse.json({ success: true, payments });
     } catch (error) {
       console.error("Error fetching payments:", error);
       return NextResponse.json(
         { success: false, message: "Server error" },
         { status: 500 }
       );
     }
   }
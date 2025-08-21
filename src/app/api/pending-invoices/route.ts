// app/api/pending-invoices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  status: string;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("Handling GET request to /api/pending-invoices");

    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;

    if (!userId || !ObjectId.isValid(userId)) {
      console.log("Invalid or missing user ID:", userId);
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      console.log("Unauthorized role:", role);
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized: Only property owners can access pending invoices",
        },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    // Fetch active properties owned by the user
    const activeProperties = await db
      .collection<Property>("properties")
      .find({
        ownerId: userId,
        status: "active",
      })
      .toArray();

    const propertyIds = activeProperties.map((p) => p._id.toString());

    if (propertyIds.length === 0) {
      console.log("No active properties found for user:", userId);
      return NextResponse.json(
        {
          success: true,
          pendingInvoices: 0,
          properties: [],
        },
        { status: 200 }
      );
    }

    // Count pending invoices for the user's active properties
    const pendingInvoicesCount = await db
      .collection<Invoice>("invoices")
      .countDocuments({
        userId,
        propertyId: { $in: propertyIds },
        status: "pending",
      });

    console.log(
      `Fetched pending invoices count for userId: ${userId}, count: ${pendingInvoicesCount}`,
      { duration: Date.now() - startTime }
    );

    return NextResponse.json(
      {
        success: true,
        pendingInvoices: pendingInvoicesCount,
        properties: propertyIds,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching pending invoices:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
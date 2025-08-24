import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

// Define Invoice interface for consistent typing
interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
}

export async function PATCH(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("Handling PATCH request to /api/invoices/update-status");

    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    console.log("Received cookies:", { userId, role });

    if (!userId || !ObjectId.isValid(userId)) {
      console.log("Invalid or missing user ID:", userId);
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (!["propertyOwner", "admin"].includes(role || "")) {
      console.log("Unauthorized role:", role);
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized: Only property owners or admins can update invoices",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { invoiceId, amount, status, description } = body;
    console.log("Request body:", { invoiceId, amount, status, description });

    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      console.log("Invalid or missing invoice ID:", invoiceId);
      return NextResponse.json(
        { success: false, message: "Valid invoice ID is required" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("Invalid amount:", amount);
      return NextResponse.json(
        { success: false, message: "Valid positive amount is required" },
        { status: 400 }
      );
    }

    if (!status || !["pending", "completed", "failed"].includes(status)) {
      console.log("Invalid status:", status);
      return NextResponse.json(
        { success: false, message: "Valid status (pending, completed, failed) is required" },
        { status: 400 }
      );
    }

    if (!description || typeof description !== "string") {
      console.log("Invalid description:", description);
      return NextResponse.json(
        { success: false, message: "Valid description is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    const existingInvoice = await db.collection<Invoice>("invoices").findOne({
      _id: new ObjectId(invoiceId),
      userId: role === "admin" ? { $exists: true } : userId, // Admins can update any invoice
    });

    if (!existingInvoice) {
      console.log("Invoice not found:", { invoiceId, userId });
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 }
      );
    }

    if (existingInvoice.status === "completed" || existingInvoice.status === "failed") {
      console.log("Invoice already finalized:", { invoiceId, status: existingInvoice.status });
      return NextResponse.json(
        { success: false, message: `Invoice is already ${existingInvoice.status}` },
        { status: 400 }
      );
    }

    const updateResult = await db.collection<Invoice>("invoices").updateOne(
      { _id: new ObjectId(invoiceId) },
      {
        $set: {
          amount,
          status,
          description,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      console.log("Failed to update invoice: No matching document", { invoiceId });
      return NextResponse.json(
        { success: false, message: "Failed to update invoice" },
        { status: 500 }
      );
    }

    console.log("Invoice updated successfully:", {
      invoiceId,
      status,
      amount,
      description,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Invoice updated successfully",
        invoice: {
          _id: existingInvoice._id.toString(),
          userId: existingInvoice.userId,
          propertyId: existingInvoice.propertyId,
          amount,
          status,
          reference: existingInvoice.reference,
          createdAt: existingInvoice.createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: existingInvoice.expiresAt.toISOString(),
          description,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating invoice:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
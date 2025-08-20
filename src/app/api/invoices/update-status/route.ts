import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

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

    if (role !== "admin") {
      console.log("Unauthorized role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized: Only admins can update invoice status" },
        { status: 401 }
      );
    }

    const { invoiceId, status } = await request.json();
    console.log("Request body:", { invoiceId, status });

    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      console.log("Invalid or missing invoice ID:", invoiceId);
      return NextResponse.json(
        { success: false, message: "Valid invoice ID is required" },
        { status: 400 }
      );
    }

    if (!["pending", "completed", "failed"].includes(status)) {
      console.log("Invalid status:", status);
      return NextResponse.json(
        { success: false, message: "Valid status (pending, completed, failed) is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    const result = await db
      .collection("invoices")
      .updateOne(
        { _id: new ObjectId(invoiceId) },
        { $set: { status, updatedAt: new Date() } }
      );
    console.log("Update result:", result);

    if (result.modifiedCount === 0) {
      console.log("No invoice found or updated for invoiceId:", invoiceId);
      return NextResponse.json(
        { success: false, message: "Invoice not found or no changes made" },
        { status: 404 }
      );
    }

    console.log(`Updated invoice status for invoiceId: ${invoiceId} to ${status}`);
    console.log("PATCH /api/invoices/update-status - Completed in", Date.now() - startTime, "ms");

    return NextResponse.json(
      { success: true, message: "Invoice status updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating invoice status:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
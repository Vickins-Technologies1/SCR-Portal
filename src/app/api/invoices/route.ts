import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

// Define Invoice interface for consistent typing
interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId?: string; // Optional to handle legacy data
  unitType: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("Handling GET request to /api/invoices");

    // Read cookies from client request
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;

    console.log("Cookies from request:", { userId, role });

    // Validate userId
    if (!userId || !ObjectId.isValid(userId)) {
      console.log("Invalid or missing user ID:", userId);
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    // Allow both propertyOwner and admin roles
    if (!["propertyOwner", "admin"].includes(role || "")) {
      console.log("Unauthorized role:", role);
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized: Only property owners or admins can access invoices",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const unitType = searchParams.get("unitType");

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    if (propertyId && unitType) {
      // Validate propertyId
      if (!ObjectId.isValid(propertyId)) {
        console.log("Invalid property ID:", propertyId);
        return NextResponse.json(
          { success: false, message: "Invalid property ID" },
          { status: 400 }
        );
      }

      // Query for invoices with case-insensitive unitType, no status filter
      const invoices = await db.collection<Invoice>("invoices").find({
        userId,
        propertyId: propertyId || { $exists: false },
        unitType: { $regex: `^${unitType}$`, $options: "i" },
      }).toArray();

      console.log(
        `Checked invoices for userId: ${userId}, propertyId: ${propertyId}, unitType: ${unitType}`,
        { found: invoices.length > 0, invoices }
      );

      if (invoices.length === 0) {
        return NextResponse.json(
          {
            success: true,
            status: "none",
            invoices: [],
          },
          { status: 200 }
        );
      }

      const formattedInvoices = invoices.map((invoice) => ({
        _id: invoice._id.toString(),
        userId: invoice.userId,
        propertyId: invoice.propertyId || "",
        unitType: invoice.unitType,
        amount: invoice.amount,
        status: invoice.status,
        reference: invoice.reference,
        createdAt: invoice.createdAt instanceof Date ? invoice.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: invoice.updatedAt instanceof Date ? invoice.updatedAt.toISOString() : new Date().toISOString(),
        expiresAt: invoice.expiresAt instanceof Date ? invoice.expiresAt.toISOString() : new Date().toISOString(),
        description: invoice.description,
      }));

      return NextResponse.json(
        {
          success: true,
          status: invoices[0].status, // Return the status of the first invoice
          invoices: formattedInvoices,
        },
        { status: 200 }
      );
    }

    // For admins, fetch all invoices; for property owners, fetch only their invoices
    const query = role === "admin" ? {} : { userId };
    const invoices = await db
      .collection<Invoice>("invoices")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`Fetched ${invoices.length} invoices for userId: ${userId}, role: ${role}`);

    // Validate and format date fields
    const formattedInvoices = invoices.map((invoice) => {
      // Log warning if date fields are invalid
      if (!invoice.createdAt || !invoice.updatedAt || !invoice.expiresAt) {
        console.warn("Invalid invoice fields", { invoiceId: invoice._id.toString(), invoice });
      }

      // Ensure date fields are valid; fallback to current date if undefined
      const createdAt = invoice.createdAt instanceof Date ? invoice.createdAt : new Date();
      const updatedAt = invoice.updatedAt instanceof Date ? invoice.updatedAt : new Date();
      const expiresAt = invoice.expiresAt instanceof Date ? invoice.expiresAt : new Date();

      return {
        _id: invoice._id.toString(),
        userId: invoice.userId,
        propertyId: invoice.propertyId || "",
        unitType: invoice.unitType,
        amount: invoice.amount,
        status: invoice.status,
        reference: invoice.reference,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        description: invoice.description,
      };
    });

    console.log("GET /api/invoices - Completed in", Date.now() - startTime, "ms");

    return NextResponse.json(
      {
        success: true,
        invoices: formattedInvoices,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching invoices:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("Handling POST request to /api/invoices");

    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;

    console.log("Cookies from request:", { userId, role });

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
    const { userId: bodyUserId, propertyId, unitType, amount, status, reference } = body;

    if (!bodyUserId || !ObjectId.isValid(bodyUserId) || bodyUserId !== userId) {
      console.log("Invalid or mismatched userId in body:", { bodyUserId, userId });
      return NextResponse.json(
        { success: false, message: "Valid and matching user ID is required" },
        { status: 400 }
      );
    }

    if (!propertyId || !ObjectId.isValid(propertyId)) {
      console.log("Invalid property ID:", propertyId);
      return NextResponse.json(
        { success: false, message: "Valid property ID is required" },
        { status: 400 }
      );
    }

    if (!unitType || typeof unitType !== "string") {
      console.log("Invalid unit type:", unitType);
      return NextResponse.json(
        { success: false, message: "Valid unit type is required" },
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

    if (!reference || typeof reference !== "string") {
      console.log("Invalid reference:", reference);
      return NextResponse.json(
        { success: false, message: "Valid reference is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    const existingInvoice = await db.collection<Invoice>("invoices").findOne({
      userId,
      propertyId,
      unitType: { $regex: `^${unitType}$`, $options: "i" },
      reference,
    });

    if (!existingInvoice) {
      console.log("Invoice not found for update:", { userId, propertyId, unitType, reference });
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 }
      );
    }

    if (existingInvoice.status === "completed" || existingInvoice.status === "failed") {
      console.log("Invoice already finalized:", { invoiceId: existingInvoice._id.toString(), status: existingInvoice.status });
      return NextResponse.json(
        { success: false, message: `Invoice is already ${existingInvoice.status}` },
        { status: 400 }
      );
    }

    const updateResult = await db.collection<Invoice>("invoices").updateOne(
      { _id: existingInvoice._id },
      {
        $set: {
          status,
          amount,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      console.log("Failed to update invoice: No matching document", { invoiceId: existingInvoice._id.toString() });
      return NextResponse.json(
        { success: false, message: "Failed to update invoice" },
        { status: 500 }
      );
    }

    console.log("Invoice updated successfully:", {
      invoiceId: existingInvoice._id.toString(),
      status,
      amount,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Invoice updated successfully",
        invoice: {
          _id: existingInvoice._id.toString(),
          userId,
          propertyId,
          unitType,
          amount,
          status,
          reference,
          createdAt: existingInvoice.createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: existingInvoice.expiresAt.toISOString(),
          description: existingInvoice.description,
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
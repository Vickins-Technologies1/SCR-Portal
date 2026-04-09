import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

// Define Invoice interface for consistent typing
interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string; // Required for property-wide invoices
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
  unitType?: string;
  billingMonth?: string;
  billingPlan?: string;
  percentage?: number;
  expectedIncome?: number;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("Handling GET request to /api/invoices");

    // Read cookies from client request
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    const ownerIdCookie = request.cookies.get("ownerId")?.value;

    console.log("Cookies from request:", { userId, role });

    // Validate userId
    if (!userId || !ObjectId.isValid(userId)) {
      console.log("Invalid or missing user ID:", userId);
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    // Allow propertyOwner, teamMember, and admin roles
    if (!["propertyOwner", "teamMember", "admin"].includes(role || "")) {
      console.log("Unauthorized role:", role);
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized: Only property owners, team members, or admins can access invoices",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const billingPlanParam = searchParams.get("billingPlan");
    const billingPlanFilter = billingPlanParam
      ? {
          $in: billingPlanParam
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        }
      : null;
    const requestedOwnerId = searchParams.get("userId") || searchParams.get("ownerId");

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    let effectiveOwnerId: string | undefined;

    if (role === "propertyOwner") {
      if (requestedOwnerId && requestedOwnerId !== userId) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Cannot access another owner's invoices" },
          { status: 403 }
        );
      }
      effectiveOwnerId = userId;
    } else if (role === "teamMember") {
      const ownerIdToUse = requestedOwnerId || ownerIdCookie;
      if (!ownerIdToUse || !ObjectId.isValid(ownerIdToUse)) {
        return NextResponse.json(
          { success: false, message: "Valid owner ID is required" },
          { status: 400 }
        );
      }

      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        ownerId: new ObjectId(ownerIdToUse),
        active: true,
      });

      if (!teamMember) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Team member not assigned to this owner" },
          { status: 403 }
        );
      }

      effectiveOwnerId = ownerIdToUse;
    } else if (role === "admin") {
      if (requestedOwnerId && !ObjectId.isValid(requestedOwnerId)) {
        return NextResponse.json(
          { success: false, message: "Invalid owner ID" },
          { status: 400 }
        );
      }
      effectiveOwnerId = requestedOwnerId || undefined;
    }

    if (propertyId) {
      const allowNonObjectId = billingPlanFilter?.$in?.includes("Airbnb");
      // Validate propertyId
      if (!ObjectId.isValid(propertyId) && !allowNonObjectId) {
        console.log("Invalid property ID:", propertyId);
        return NextResponse.json(
          { success: false, message: "Invalid property ID" },
          { status: 400 }
        );
      }

      const baseQuery = effectiveOwnerId ? { userId: effectiveOwnerId } : {};
      const planQuery = billingPlanFilter ? { billingPlan: billingPlanFilter } : {};
      const pendingInvoices = await db
        .collection<Invoice>("invoices")
        .find({ ...baseQuery, propertyId, status: "pending", ...planQuery })
        .sort({ createdAt: -1 })
        .toArray();

      const invoices = pendingInvoices.length > 0
        ? pendingInvoices
        : await db
          .collection<Invoice>("invoices")
          .find({ ...baseQuery, propertyId, ...planQuery })
          .sort({ createdAt: -1 })
          .toArray();

      console.log(
        `Checked invoices for userId: ${userId}, propertyId: ${propertyId}`,
        { found: invoices.length > 0, invoices }
      );

      if (invoices.length === 0) {
        return NextResponse.json(
          {
            success: true,
            status: "none",
            pendingInvoices: 0,
            invoices: [],
          },
          { status: 200 }
        );
      }

      const formattedInvoices = invoices.map((invoice) => ({
        _id: invoice._id.toString(),
        userId: invoice.userId,
        propertyId: invoice.propertyId,
        amount: invoice.amount,
        status: invoice.status,
        reference: invoice.reference,
        createdAt: invoice.createdAt instanceof Date ? invoice.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: invoice.updatedAt instanceof Date ? invoice.updatedAt.toISOString() : new Date().toISOString(),
        expiresAt: invoice.expiresAt instanceof Date ? invoice.expiresAt.toISOString() : new Date().toISOString(),
        description: invoice.description,
        unitType: invoice.unitType,
        billingMonth: invoice.billingMonth,
        billingPlan: invoice.billingPlan,
        percentage: invoice.percentage,
        expectedIncome: invoice.expectedIncome,
      }));

      return NextResponse.json(
        {
          success: true,
          status: invoices[0].status,
          pendingInvoices: pendingInvoices.length,
          invoices: formattedInvoices,
        },
        { status: 200 }
      );
    }

    // For admins, fetch all invoices (or filter by owner if provided); otherwise fetch owner's invoices
    const baseQuery = role === "admin"
      ? (effectiveOwnerId ? { userId: effectiveOwnerId } : {})
      : { userId: effectiveOwnerId as string };
    const planQuery = billingPlanFilter ? { billingPlan: billingPlanFilter } : {};
    const query = { ...baseQuery, ...planQuery };
    const invoices = await db
      .collection<Invoice>("invoices")
      .find(query).toArray();
    const statusOrder: Record<string, number> = { pending: 0, failed: 1, completed: 2 };
    invoices.sort((a, b) => {
      const orderA = statusOrder[a.status] ?? 9;
      const orderB = statusOrder[b.status] ?? 9;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const pendingCount = invoices.filter((inv) => inv.status === "pending").length;

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
        propertyId: invoice.propertyId,
        amount: invoice.amount,
        status: invoice.status,
        reference: invoice.reference,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        description: invoice.description,
        unitType: invoice.unitType,
        billingMonth: invoice.billingMonth,
        billingPlan: invoice.billingPlan,
        percentage: invoice.percentage,
        expectedIncome: invoice.expectedIncome,
      };
    });

    console.log("GET /api/invoices - Completed in", Date.now() - startTime, "ms");

    return NextResponse.json(
      {
        success: true,
        pendingInvoices: pendingCount,
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

    if (!["propertyOwner", "teamMember", "admin"].includes(role || "")) {
      console.log("Unauthorized role:", role);
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized: Only property owners, team members, or admins can create or update invoices",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { userId: bodyUserId, propertyId, amount, status, reference, description, billingPlan } = body;

    if (!bodyUserId || !ObjectId.isValid(bodyUserId)) {
      console.log("Invalid or missing userId in body:", { bodyUserId, userId });
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    const allowNonObjectId = billingPlan === "Airbnb";
    if (!propertyId || (!ObjectId.isValid(propertyId) && !allowNonObjectId)) {
      console.log("Invalid property ID:", propertyId);
      return NextResponse.json(
        { success: false, message: "Valid property ID is required" },
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

    if (!description || typeof description !== "string") {
      console.log("Invalid description:", description);
      return NextResponse.json(
        { success: false, message: "Valid description is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to MongoDB");

    let effectiveOwnerId = bodyUserId;

    if (role === "propertyOwner") {
      if (bodyUserId !== userId) {
        console.log("Mismatched owner ID for propertyOwner:", { bodyUserId, userId });
        return NextResponse.json(
          { success: false, message: "Owner ID does not match the logged-in user" },
          { status: 403 }
        );
      }
      effectiveOwnerId = userId;
    } else if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        ownerId: new ObjectId(bodyUserId),
        active: true,
      });

      if (!teamMember) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Team member not assigned to this owner" },
          { status: 403 }
        );
      }
      effectiveOwnerId = bodyUserId;
    }

    const existingInvoice = await db.collection<Invoice>("invoices").findOne({
      userId: effectiveOwnerId,
      propertyId,
      reference,
    });

    if (!existingInvoice) {
      console.log("Invoice not found for update:", { userId: effectiveOwnerId, propertyId, reference });
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
          description,
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
          userId: effectiveOwnerId,
          propertyId,
          amount,
          status,
          reference,
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










import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { TenantRequest } from "../../../types/tenant";
import { getManagementFee } from "../../../lib/unitTypes";

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  managementFee: number;
  quantity: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
  unitTypes: UnitType[];
}

interface Tenant {
  _id: ObjectId;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: Date;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("GET /api/tenants - Cookies - userId:", userId, "role:", role);

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    console.log("GET /api/tenants - Connected to database: rentaldb, collection: tenants");

    const tenants = await db
      .collection<Tenant>("tenants")
      .find({ ownerId: userId })
      .toArray();
    console.log("GET /api/tenants - Tenant count for userId:", userId, "count:", tenants.length);

    return NextResponse.json(
      {
        success: true,
        tenants: tenants.map((tenant) => ({
          ...tenant,
          _id: tenant._id.toString(),
          createdAt: tenant.createdAt.toISOString(),
        })),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in GET /api/tenants:", {
      message: error.message || "Unknown error",
      stack: error.stack,
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
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("POST /api/tenants - Cookies - userId:", userId, "role:", role);

    if (!userId || !ObjectId.isValid(userId)) {
      console.log("Invalid or missing user ID:", userId);
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      console.log("Unauthorized - role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const requestData: TenantRequest = await request.json();
    console.log("POST /api/tenants - Request body:", requestData);

    const { db }: { db: Db } = await connectToDatabase();
    console.log("POST /api/tenants - Connected to database: rentaldb, collection: tenants");

    // Validate required fields
    const requiredFields = [
      "name",
      "email",
      "phone",
      "password",
      "role",
      "propertyId",
      "unitType",
      "price",
      "deposit",
      "houseNumber",
      "leaseStartDate",
      "leaseEndDate",
    ];
    for (const field of requiredFields) {
      if (!requestData[field as keyof TenantRequest]) {
        console.log(`Validation failed - Missing field: ${field}`);
        return NextResponse.json(
          { success: false, message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestData.email)) {
      console.log("Validation failed - Invalid email format:", requestData.email);
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate phone format
    if (!/^\+?\d{10,15}$/.test(requestData.phone)) {
      console.log("Validation failed - Invalid phone format:", requestData.phone);
      return NextResponse.json(
        { success: false, message: "Invalid phone number (10-15 digits, optional +)" },
        { status: 400 }
      );
    }

    // Validate property exists and belongs to user
    if (!ObjectId.isValid(requestData.propertyId)) {
      console.log("Validation failed - Invalid propertyId:", requestData.propertyId);
      return NextResponse.json(
        { success: false, message: "Invalid property ID" },
        { status: 400 }
      );
    }

    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(requestData.propertyId),
      ownerId: userId,
    });

    if (!property) {
      console.log("Validation failed - Property not found or not owned by user:", requestData.propertyId);
      return NextResponse.json(
        { success: false, message: "Property not found or not owned by user" },
        { status: 404 }
      );
    }

    // Validate unit type
    const unit = property.unitTypes.find((u) => u.type === requestData.unitType);
    if (!unit || unit.quantity <= 0) {
      console.log("Validation failed - Unit type not found or no available units:", requestData.unitType);
      return NextResponse.json(
        { success: false, message: "Unit type not found or no available units" },
        { status: 400 }
      );
    }

    // Validate price and deposit
    if (requestData.price !== unit.price || requestData.deposit !== unit.deposit) {
      console.log("Validation failed - Price or deposit mismatch:", {
        requestedPrice: requestData.price,
        unitPrice: unit.price,
        requestedDeposit: requestData.deposit,
        unitDeposit: unit.deposit,
      });
      return NextResponse.json(
        { success: false, message: "Price or deposit does not match unit type" },
        { status: 400 }
      );
    }

    // Check payment status and wallet balance
    const user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      console.log("User not found:", userId);
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Calculate onboarding fee (per tenant, based on unit type's management fee)
    const onboardingFee = getManagementFee({
      type: requestData.unitType,
      managementType: unit.managementType,
      quantity: 1,
    }) || 1000; // Default to 1000 Ksh if managementFee is 0
    console.log("POST /api/tenants - Onboarding fee for tenant:", { unitType: requestData.unitType, onboardingFee });

    // Check tenant count and invoice status
    const tenantCount = await db.collection("tenants").countDocuments({ ownerId: userId });
    console.log("POST /api/tenants - Tenant count for userId:", userId, "count:", tenantCount);

    let invoice = null;
    if (tenantCount >= 3) {
      const pendingInvoices = await db.collection("invoices").find({
        userId,
        status: { $ne: "completed" },
      }).toArray();

      if (pendingInvoices.length > 0) {
        console.log("Cannot add tenant - Pending invoices found:", pendingInvoices.length);
        return NextResponse.json(
          { success: false, message: "Cannot add more tenants until all pending invoices are paid." },
          { status: 402 }
        );
      }

      if (user.paymentStatus !== "active" || user.walletBalance < onboardingFee) {
        console.log("Insufficient payment status or wallet balance:", {
          paymentStatus: user.paymentStatus,
          walletBalance: user.walletBalance,
          requiredFee: onboardingFee,
        });
        return NextResponse.json(
          {
            success: false,
            message: `You need an active payment status and a minimum wallet balance of Ksh ${onboardingFee} to add more than 3 tenants.`,
          },
          { status: 402 }
        );
      }

      // Generate invoice
      const invoiceStart = Date.now();
      invoice = {
        userId,
        amount: onboardingFee,
        reference: `TENANT-INVOICE-${userId}-${Date.now()}`,
        status: "pending",
        createdAt: new Date(),
        description: `Tenant onboarding fee for ${requestData.name} in ${property.name}`,
      };
      await db.collection("invoices").insertOne(invoice);
      console.log("Generated invoice:", {
        ...invoice,
        invoiceDuration: Date.now() - invoiceStart,
      });

      // Deduct wallet balance and mark invoice as completed
      const updateStart = Date.now();
      await db.collection("propertyOwners").updateOne(
        { _id: new ObjectId(userId) },
        { $inc: { walletBalance: -onboardingFee } }
      );
      await db.collection("invoices").updateOne(
        { reference: invoice.reference },
        { $set: { status: "completed", updatedAt: new Date() } }
      );
      console.log("Wallet balance updated and invoice marked as completed:", {
        userId,
        deductedAmount: onboardingFee,
        updateDuration: Date.now() - updateStart,
      });
    }

    // Insert tenant
    const tenantData = {
      ownerId: userId,
      name: requestData.name,
      email: requestData.email,
      phone: requestData.phone,
      password: requestData.password, // Should be hashed in production
      role: "tenant",
      propertyId: requestData.propertyId,
      unitType: requestData.unitType,
      price: requestData.price,
      deposit: requestData.deposit,
      houseNumber: requestData.houseNumber,
      leaseStartDate: requestData.leaseStartDate,
      leaseEndDate: requestData.leaseEndDate,
      createdAt: new Date(),
    };

    const insertStart = Date.now();
    const result = await db.collection("tenants").insertOne(tenantData);
    console.log("Tenant inserted:", {
      tenantId: result.insertedId,
      insertDuration: Date.now() - insertStart,
    });

    // Update property unit quantity
    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(requestData.propertyId), "unitTypes.type": requestData.unitType },
      { $inc: { "unitTypes.$.quantity": -1 } }
    );

    console.log("POST /api/tenants - Completed in", Date.now() - startTime, "ms");
    return NextResponse.json(
      {
        success: true,
        message: "Tenant added successfully",
        tenantId: result.insertedId.toString(),
        invoice: invoice
          ? {
              ...invoice,
              createdAt: invoice.createdAt.toISOString(),
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/tenants:", {
      message: error.message || "Unknown error",
      stack: error.stack,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
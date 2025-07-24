import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { TenantRequest } from "../../../../types/tenant";

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
  requiresAdminApproval?: boolean;
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
  updatedAt?: Date;
  walletBalance: number;
}

export async function PUT(request: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("PUT /api/tenants/[tenantId] - Cookies - userId:", userId, "role:", role, "tenantId:", params.tenantId);

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      console.log("Unauthorized - userId:", userId, "role:", role);
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const tenantId = params.tenantId;
    if (!tenantId || !ObjectId.isValid(tenantId)) {
      console.log("Validation failed - Invalid or missing tenantId:", tenantId);
      return NextResponse.json(
        { success: false, message: "Invalid or missing tenant ID" },
        { status: 400 }
      );
    }

    const requestData: Partial<TenantRequest> = await request.json();
    console.log("PUT /api/tenants/[tenantId] - Request body:", requestData);

    const { db }: { db: Db } = await connectToDatabase();
    console.log("PUT /api/tenants/[tenantId] - Connected to database: rentaldb, collection: tenants");

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!tenant) {
      console.log("Tenant not found or not owned by user:", tenantId);
      return NextResponse.json(
        { success: false, message: "Tenant not found or not owned by user" },
        { status: 404 }
      );
    }

    // Define updatable fields that exist in both Tenant and TenantRequest
    const updatableFields: Array<keyof Tenant & keyof TenantRequest> = [
      "name",
      "email",
      "phone",
      "password",
      "propertyId",
      "unitType",
      "price",
      "deposit",
      "houseNumber",
      "leaseStartDate",
      "leaseEndDate",
    ];

    const updateData: Partial<Tenant> = {};

    // Define this before the loop
function setUpdateField<K extends keyof Tenant>(field: K, value: Tenant[K]) {
  updateData[field] = value;
}

for (const field of updatableFields) {
  const value = requestData[field];

  if (value !== undefined) {
    if (field === "price" || field === "deposit") {
      const numericValue = typeof value === "number" ? value : Number(value);
      if (!isNaN(numericValue)) {
        setUpdateField(field, numericValue as Tenant[typeof field]);
      }
    } else if (field === "password" && value === "") {
      continue; // Skip empty passwords
    } else {
      setUpdateField(field, value as Tenant[typeof field]);
    }
  }
}





    // Validate email format if provided
    if (updateData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email)) {
      console.log("Validation failed - Invalid email format:", updateData.email);
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate phone format if provided
    if (updateData.phone && !/^\+?\d{10,15}$/.test(updateData.phone)) {
      console.log("Validation failed - Invalid phone format:", updateData.phone);
      return NextResponse.json(
        { success: false, message: "Invalid phone number (10-15 digits, optional +)" },
        { status: 400 }
      );
    }

    // Validate propertyId and unitType if provided
    if (updateData.propertyId) {
      if (!ObjectId.isValid(updateData.propertyId)) {
        console.log("Validation failed - Invalid propertyId:", updateData.propertyId);
        return NextResponse.json(
          { success: false, message: "Invalid property ID" },
          { status: 400 }
        );
      }

      const property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(updateData.propertyId),
        ownerId: userId,
      });

      if (!property) {
        console.log("Validation failed - Property not found or not owned by user:", updateData.propertyId);
        return NextResponse.json(
          { success: false, message: "Property not found or not owned by user" },
          { status: 404 }
        );
      }

      if (property.requiresAdminApproval) {
        console.log("Property requires admin approval:", updateData.propertyId);
        return NextResponse.json(
          { success: false, message: "Cannot update tenant to property requiring admin approval" },
          { status: 403 }
        );
      }

      if (updateData.unitType) {
        const unit = property.unitTypes.find((u) => u.type === updateData.unitType);
        if (!unit) {
          console.log("Validation failed - Unit type not found:", updateData.unitType);
          return NextResponse.json(
            { success: false, message: "Unit type not found" },
            { status: 400 }
          );
        }

        if (
          (updateData.price !== undefined && updateData.price !== unit.price) ||
          (updateData.deposit !== undefined && updateData.deposit !== unit.deposit)
        ) {
          console.log("Validation failed - Price or deposit mismatch:", {
            requestedPrice: updateData.price,
            unitPrice: unit.price,
            requestedDeposit: updateData.deposit,
            unitDeposit: unit.deposit,
          });
          return NextResponse.json(
            { success: false, message: "Price or deposit does not match unit type" },
            { status: 400 }
          );
        }

        // Set price and deposit to match unit type if only unitType is updated
        updateData.price = updateData.price ?? unit.price;
        updateData.deposit = updateData.deposit ?? unit.deposit;
      }
    }

    // Ensure role remains "tenant" if provided
    if (requestData.role && requestData.role !== "tenant") {
      console.log("Validation failed - Invalid role:", requestData.role);
      return NextResponse.json(
        { success: false, message: "Role must be 'tenant'" },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length === 0) {
      console.log("No fields provided for update");
      return NextResponse.json(
        { success: false, message: "No fields provided for update" },
        { status: 400 }
      );
    }

    // Update tenant with updatedAt
    updateData.updatedAt = new Date();
    const result = await db.collection<Tenant>("tenants").findOneAndUpdate(
      { _id: new ObjectId(tenantId), ownerId: userId },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      console.log("Failed to update tenant - No match found:", tenantId);
      return NextResponse.json(
        { success: false, message: "Failed to update tenant" },
        { status: 404 }
      );
    }

    console.log("Tenant updated:", { tenantId, updatedFields: Object.keys(updateData) });
    return NextResponse.json(
      {
        success: true,
        message: "Tenant updated successfully",
        tenant: {
          ...result,
          _id: result._id.toString(),
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt?.toISOString(),
          walletBalance: result.walletBalance ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in PUT /api/tenants/[tenantId]:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

// Define interfaces to match the provided schema
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
  createdAt: Date;
  updatedAt?: Date;
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

interface TenantRequest {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
  propertyId?: string;
  unitType?: string;
  price?: number;
  deposit?: number;
  houseNumber?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params; // Await params to resolve the Promise
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value as 'admin' | 'propertyOwner' | 'tenant' | undefined;
    console.log("GET /api/tenants/[tenantId] - Cookies", { userId, role, tenantId });

    if (!userId || !ObjectId.isValid(userId) || !['propertyOwner', 'tenant'].includes(role || '')) {
      console.log("Unauthorized", { userId, role });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner or tenant." },
        { status: 401 }
      );
    }

    if (!tenantId || !ObjectId.isValid(tenantId)) {
      console.log("Invalid tenantId", { tenantId });
      return NextResponse.json(
        { success: false, message: "Invalid or missing tenant ID" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    console.log("Connected to database: rentaldb, collection: tenants");

    let tenant: Tenant | null = null;
    if (role === 'propertyOwner') {
      tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
        ownerId: userId, // Use string directly since Tenant.ownerId is string
      });
    } else if (role === 'tenant') {
      if (userId !== tenantId) {
        console.log("Tenant access denied - User ID mismatch", { userId, tenantId });
        return NextResponse.json(
          { success: false, message: "Unauthorized: Tenants can only access their own profile" },
          { status: 403 }
        );
      }
      tenant = await db.collection<Tenant>("tenants").findOne({
        _id: new ObjectId(tenantId),
      });
    }

    if (!tenant) {
      console.log("Tenant lookup failed", { tenantId, userId, role });
      return NextResponse.json(
        { success: false, message: "Tenant not found or not authorized" },
        { status: 404 }
      );
    }

    console.log("Tenant fetched successfully", { tenantId, userId, role });
    return NextResponse.json(
      {
        success: true,
        tenant: {
          ...tenant,
          _id: tenant._id.toString(),
          propertyId: tenant.propertyId.toString(),
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt?.toISOString(),
          walletBalance: tenant.walletBalance ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in GET /api/tenants/[tenantId]", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params; // Await params to resolve the Promise
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("PUT /api/tenants/[tenantId] - Cookies", { userId, role, tenantId });

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      console.log("Unauthorized", { userId, role });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    if (!tenantId || !ObjectId.isValid(tenantId)) {
      console.log("Invalid tenantId", { tenantId });
      return NextResponse.json(
        { success: false, message: "Invalid or missing tenant ID" },
        { status: 400 }
      );
    }

    const requestData: Partial<TenantRequest> = await request.json();
    console.log("Request body", { requestData });

    const { db }: { db: Db } = await connectToDatabase();
    console.log("Connected to database: rentaldb, collection: tenants");

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId, // Use string directly
    });

    if (!tenant) {
      console.log("Tenant lookup failed", { tenantId, userId });
      return NextResponse.json(
        { success: false, message: "Tenant not found or not owned by user" },
        { status: 404 }
      );
    }

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
          continue;
        } else {
          setUpdateField(field, value as Tenant[typeof field]);
        }
      }
    }

    if (updateData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email)) {
      console.log("Invalid email format", { email: updateData.email });
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    if (updateData.phone && !/^\+?\d{10,15}$/.test(updateData.phone)) {
      console.log("Invalid phone format", { phone: updateData.phone });
      return NextResponse.json(
        { success: false, message: "Invalid phone number (10-15 digits, optional +)" },
        { status: 400 }
      );
    }

    if (updateData.propertyId) {
      if (!ObjectId.isValid(updateData.propertyId)) {
        console.log("Invalid propertyId", { propertyId: updateData.propertyId });
        return NextResponse.json(
          { success: false, message: "Invalid property ID" },
          { status: 400 }
        );
      }

      const property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(updateData.propertyId),
        ownerId: userId, // Use string directly
      });

      if (!property) {
        console.log("Property not found", { propertyId: updateData.propertyId });
        return NextResponse.json(
          { success: false, message: "Property not found or not owned by user" },
          { status: 404 }
        );
      }

      if (property.requiresAdminApproval) {
        console.log("Property requires admin approval", { propertyId: updateData.propertyId });
        return NextResponse.json(
          { success: false, message: "Cannot update tenant to property requiring admin approval" },
          { status: 403 }
        );
      }

      if (updateData.unitType) {
        const unit = property.unitTypes.find((u: UnitType) => u.type === updateData.unitType);
        if (!unit) {
          console.log("Unit type not found", { unitType: updateData.unitType });
          return NextResponse.json(
            { success: false, message: "Unit type not found" },
            { status: 400 }
          );
        }

        if (
          (updateData.price !== undefined && updateData.price !== unit.price) ||
          (updateData.deposit !== undefined && updateData.deposit !== unit.deposit)
        ) {
          console.log("Price or deposit mismatch", {
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

        updateData.price = updateData.price ?? unit.price;
        updateData.deposit = updateData.deposit ?? unit.deposit;
      }
    }

    if (requestData.role && requestData.role !== "tenant") {
      console.log("Invalid role", { role: requestData.role });
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

    updateData.updatedAt = new Date();
    const result = await db.collection<Tenant>("tenants").findOneAndUpdate(
      {
        _id: new ObjectId(tenantId),
        ownerId: userId, // Use string directly
      },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      console.log("Failed to update tenant", { tenantId });
      return NextResponse.json(
        { success: false, message: "Failed to update tenant" },
        { status: 404 }
      );
    }

    console.log("Tenant updated", { tenantId, updatedFields: Object.keys(updateData) });
    return NextResponse.json(
      {
        success: true,
        message: "Tenant updated successfully",
        tenant: {
          ...result,
          _id: result._id.toString(),
          propertyId: result.propertyId.toString(),
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt?.toISOString(),
          walletBalance: result.walletBalance ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in PUT /api/tenants/[tenantId]", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params; // Await params to resolve the Promise
    const cookieStore = request.cookies;
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    console.log("DELETE /api/tenants/[tenantId] - Cookies", { userId, role, tenantId });

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      console.log("Unauthorized", { userId, role });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    if (!tenantId || !ObjectId.isValid(tenantId)) {
      console.log("Invalid tenantId", { tenantId });
      return NextResponse.json(
        { success: false, message: "Invalid or missing tenant ID" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    console.log("Connected to database: rentaldb, collection: tenants");

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId, // Use string directly
    });

    if (!tenant) {
      console.log("Tenant lookup failed", { tenantId, userId });
      return NextResponse.json(
        { success: false, message: "Tenant not found or not owned by user" },
        { status: 404 }
      );
    }

    const deleteResult = await db.collection<Tenant>("tenants").deleteOne({
      _id: new ObjectId(tenantId),
      ownerId: userId, // Use string directly
    });

    if (deleteResult.deletedCount === 0) {
      console.log("Failed to delete tenant", { tenantId });
      return NextResponse.json(
        { success: false, message: "Failed to delete tenant" },
        { status: 404 }
      );
    }

    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(tenant.propertyId), "unitTypes.type": tenant.unitType },
      { $inc: { "unitTypes.$.quantity": 1 } }
    );
    console.log("Updated property unit quantity", { propertyId: tenant.propertyId, unitType: tenant.unitType });

    console.log("Tenant deleted successfully", { tenantId });
    return NextResponse.json(
      {
        success: true,
        message: "Tenant deleted successfully",
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in DELETE /api/tenants/[tenantId]", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
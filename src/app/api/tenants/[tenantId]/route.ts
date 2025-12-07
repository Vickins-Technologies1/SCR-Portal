// src/app/api/tenants/[tenantId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { Tenant, ResponseTenant, TenantRequest } from "../../../../types/tenant";
import { Property } from "../../../../types/property";

const logger = {
  info: (msg: string, meta?: any) => console.info(`[INFO] ${msg}`, meta || ""),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ""),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ""),
};

// CSRF Validation
const validateCsrfToken = async (request: NextRequest): Promise<boolean> => {
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = (await cookies()).get("csrf-token")?.value;
  return headerToken === cookieToken && !!headerToken;
};

// Helper: enrich unitTypes with uniqueType if missing
const enrichUnitTypes = (unitTypes: any[]) =>
  unitTypes.map((unit, index) => ({
    ...unit,
    uniqueType: unit.uniqueType || `${unit.type}-${index}`,
  }));

// Safe date formatter (handles string, Date, or invalid values)
const formatDate = (date: any): string => {
  if (!date) return "";
  const d = new Date(date);
  return isNaN(d.getTime()) ? "" : d.toISOString();
};

// GET: Fetch single tenant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const userId = (await cookies()).get("userId")?.value;
  const role = (await cookies()).get("role")?.value;

  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "admin"].includes(role || "")) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!(await validateCsrfToken(request))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  if (!ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(tenant.propertyId),
      ownerId: userId,
    });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      tenant: {
        ...tenant,
        _id: tenant._id.toString(),
        createdAt: formatDate(tenant.createdAt),
        updatedAt: formatDate(tenant.updatedAt),
      },
      property: {
        _id: property._id.toString(),
        name: property.name,
      },
    });
  } catch (error: any) {
    logger.error("GET /api/tenants/[tenantId]", { error: error.message });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// PUT: Update tenant (supports unit/property change)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const userId = (await cookies()).get("userId")?.value;

  if (!ObjectId.isValid(tenantId) || !userId || !ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  if (!(await validateCsrfToken(request))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const body: Partial<TenantRequest> = await request.json();
    const { db } = await connectToDatabase();

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const updateData: any = { updatedAt: new Date() };

    // Simple fields
    if (body.name) updateData.name = body.name.trim();
    if (body.email) updateData.email = body.email.trim();
    if (body.phone) updateData.phone = body.phone.trim();
    if (body.houseNumber) updateData.houseNumber = body.houseNumber.trim();
    if (body.leaseStartDate) updateData.leaseStartDate = body.leaseStartDate;
    if (body.leaseEndDate) updateData.leaseEndDate = body.leaseEndDate;
    if (body.password?.trim()) updateData.password = await bcrypt.hash(body.password.trim(), 10);

    // Handle property/unit change
    if (body.propertyId || body.unitIdentifier) {
      const targetPropertyId = body.propertyId || tenant.propertyId;
      const property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(targetPropertyId),
        ownerId: userId,
      });

      if (!property) {
        return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
      }

      const enrichedUnits = enrichUnitTypes(property.unitTypes);
      const targetUnit = enrichedUnits.find(u => u.uniqueType === (body.unitIdentifier || tenant.unitIdentifier));

      if (!targetUnit) {
        return NextResponse.json({ success: false, message: "Invalid unit selected" }, { status: 400 });
      }

      if (targetUnit.quantity <= 0 && targetUnit.uniqueType !== tenant.unitIdentifier) {
        return NextResponse.json({ success: false, message: "This unit is fully booked" }, { status: 400 });
      }

      // Only decrement old unit if changing
      if (tenant.propertyId !== targetPropertyId || tenant.unitIdentifier !== targetUnit.uniqueType) {
        // Increment old unit
        await db.collection<Property>("properties").updateOne(
          { _id: new ObjectId(tenant.propertyId) },
          { $inc: { "unitTypes.$[elem].quantity": 1 } },
          { arrayFilters: [{ "elem.uniqueType": tenant.unitIdentifier }] }
        );

        // Decrement new unit
        await db.collection<Property>("properties").updateOne(
          { _id: new ObjectId(targetPropertyId) },
          { $inc: { "unitTypes.$[elem].quantity": -1 } },
          { arrayFilters: [{ "elem.uniqueType": targetUnit.uniqueType }] }
        );
      }

      updateData.propertyId = targetPropertyId;
      updateData.unitType = targetUnit.type;
      updateData.unitIdentifier = targetUnit.uniqueType;
      updateData.price = targetUnit.price;
      updateData.deposit = targetUnit.deposit;
    }

    const result = await db.collection<Tenant>("tenants").findOneAndUpdate(
      { _id: new ObjectId(tenantId), ownerId: userId },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json({ success: false, message: "Update failed" }, { status: 500 });
    }

    logger.info("Tenant updated", { tenantId, updatedFields: Object.keys(updateData) });

    return NextResponse.json({
      success: true,
      message: "Tenant updated successfully",
      tenant: {
        ...result,
        _id: result._id.toString(),
        createdAt: formatDate(result.createdAt),
        updatedAt: formatDate(result.updatedAt),
      },
    });
  } catch (error: any) {
    logger.error("PUT /api/tenants/[tenantId]", { error: error.message });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// DELETE: Remove tenant and restore unit quantity
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const userId = (await cookies()).get("userId")?.value;

  if (!ObjectId.isValid(tenantId) || !userId || !ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  if (!(await validateCsrfToken(request))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    // Delete tenant
    await db.collection<Tenant>("tenants").deleteOne({ _id: new ObjectId(tenantId) });

    // Delete payments
    const { deletedCount } = await db.collection("payments").deleteMany({
      tenantId: tenant._id.toString(),
    });

    // Restore unit quantity
    await db.collection<Property>("properties").updateOne(
      { _id: new ObjectId(tenant.propertyId) },
      { $inc: { "unitTypes.$[elem].quantity": 1 } },
      { arrayFilters: [{ "elem.uniqueType": tenant.unitIdentifier }] }
    );

    logger.info("Tenant deleted", { tenantId, restoredUnit: tenant.unitIdentifier, deletedPayments: deletedCount });

    return NextResponse.json({
      success: true,
      message: "Tenant deleted successfully",
      deletedPaymentsCount: deletedCount,
    });
  } catch (error: any) {
    logger.error("DELETE /api/tenants/[tenantId]", { error: error.message });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
// src/app/api/tenants/[tenantId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { Tenant, ResponseTenant, TenantRequest } from "../../../../types/tenant";
import { Property } from "../../../../types/property";
import { sendTenantDeletionRequestEmail } from "../../../../lib/email";
import { sendWelcomeSms } from "../../../../lib/sms";
import { sendWhatsAppMessage } from "../../../../lib/whatsapp";

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

const NON_OCCUPYING_STATUSES: Tenant["status"][] = ["terminated", "inactive", "moved out"];

const buildOccupiedByUnitIdentifier = async (
  db: Db,
  propertyId: string,
  excludeTenantId?: ObjectId,
  now: Date = new Date()
): Promise<Map<string, number>> => {
  const propertyIdCandidates: Array<string | ObjectId> = [propertyId];
  if (ObjectId.isValid(propertyId)) {
    propertyIdCandidates.push(new ObjectId(propertyId));
  }

  const todayISO = now.toISOString();
  const query: any = {
    propertyId: { $in: propertyIdCandidates },
    status: { $nin: NON_OCCUPYING_STATUSES },
    leaseStartDate: { $ne: null, $lte: todayISO },
    leaseEndDate: { $ne: null, $gte: todayISO },
  };
  if (excludeTenantId) {
    query._id = { $ne: excludeTenantId };
  }

  const tenants = await db.collection<Tenant>("tenants")
    .find(query, { projection: { leasedUnits: 1, unitIdentifier: 1, unitType: 1 } })
    .toArray();

  const occupiedByUnit = new Map<string, number>();
  const bump = (key?: string) => {
    if (!key) return;
    occupiedByUnit.set(key, (occupiedByUnit.get(key) || 0) + 1);
  };

  for (const tenant of tenants) {
    if (Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length > 0) {
      for (const unit of tenant.leasedUnits) {
        bump(unit?.unitIdentifier || unit?.unitType);
      }
    } else {
      bump(tenant.unitIdentifier || tenant.unitType);
    }
  }

  return occupiedByUnit;
};

// GET: Fetch single tenant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember", "admin"].includes(role || "")) {
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
    let effectiveOwnerId = userId;

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        active: true,
      });

      if (!teamMember || !teamMember.ownerId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }

      effectiveOwnerId = teamMember.ownerId.toString();
    }

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: effectiveOwnerId,
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(tenant.propertyId),
      ownerId: effectiveOwnerId,
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

    const wantsLeaseUpdate = Boolean(
      (Array.isArray(body.leasedUnits) && body.leasedUnits.length > 0) ||
      body.unitIdentifier ||
      body.houseNumber ||
      body.propertyId
    );

    if (wantsLeaseUpdate) {
      const targetPropertyId = body.propertyId || tenant.propertyId;

      const rawLeaseInputs = Array.isArray(body.leasedUnits) && body.leasedUnits.length > 0
        ? body.leasedUnits
        : [{
            unitIdentifier: body.unitIdentifier || tenant.unitIdentifier,
            houseNumber: body.houseNumber || tenant.houseNumber,
          }];

      if (!rawLeaseInputs.length || rawLeaseInputs.some((unit) => !unit.unitIdentifier || !unit.houseNumber)) {
        return NextResponse.json(
          { success: false, message: "Each leased unit must include a unit type and house number." },
          { status: 400 }
        );
      }

      const houseNumbers = rawLeaseInputs.map((unit) => unit.houseNumber.trim());
      const uniqueHouseNumbers = new Set(houseNumbers.map((h) => h.toLowerCase()));
      if (uniqueHouseNumbers.size !== houseNumbers.length) {
        return NextResponse.json(
          { success: false, message: "House numbers must be unique within the same tenant." },
          { status: 400 }
        );
      }

      const property = await db.collection<Property>("properties").findOne({
        _id: new ObjectId(targetPropertyId),
        ownerId: userId,
      });

      if (!property) {
        return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
      }

      const enrichedUnits = enrichUnitTypes(property.unitTypes);
      const configById = new Map(enrichedUnits.map((unit) => [unit.uniqueType, unit]));

      const requestedCounts = new Map<string, number>();
      const desiredLeases: Tenant["leasedUnits"] = [];

      for (const unit of rawLeaseInputs) {
        const config = configById.get(unit.unitIdentifier);
        if (!config) {
          return NextResponse.json(
            { success: false, message: `Invalid unit selected: ${unit.unitIdentifier}` },
            { status: 400 }
          );
        }
        const count = requestedCounts.get(unit.unitIdentifier) || 0;
        requestedCounts.set(unit.unitIdentifier, count + 1);
        desiredLeases.push({
          unitIdentifier: config.uniqueType,
          unitType: config.type,
          houseNumber: unit.houseNumber.trim(),
          price: config.price,
          deposit: config.deposit,
        });
      }

      const propertyIdCandidates: Array<string | ObjectId> = [targetPropertyId];
      if (ObjectId.isValid(targetPropertyId)) {
        propertyIdCandidates.push(new ObjectId(targetPropertyId));
      }

      const otherTenant = await db.collection<Tenant>("tenants").findOne({
        _id: { $ne: tenant._id },
        propertyId: { $in: propertyIdCandidates as any },
        status: { $nin: ["terminated", "inactive", "moved out"] },
        $or: [
          { houseNumber: { $in: houseNumbers } },
          { "leasedUnits.houseNumber": { $in: houseNumbers } },
        ],
      });

      if (otherTenant) {
        return NextResponse.json(
          { success: false, message: `One or more unit numbers (${houseNumbers.join(", ")}) are already occupied.` },
          { status: 409 }
        );
      }

      const occupiedByUnit = await buildOccupiedByUnitIdentifier(db, targetPropertyId, tenant._id, new Date());

      for (const [unitIdentifier, count] of requestedCounts.entries()) {
        const config = configById.get(unitIdentifier);
        if (!config) continue;
        const occupied = occupiedByUnit.get(unitIdentifier) ?? occupiedByUnit.get(config.type) ?? 0;
        const totalQuantity = typeof config.quantity === "number" ? config.quantity : 0;
        const available = Math.max(0, totalQuantity - occupied);
        if (available < count) {
          return NextResponse.json(
            {
              success: false,
              message: `Not enough available units for ${config.type}. Requested ${count}, available ${available}.`,
            },
            { status: 400 }
          );
        }
      }

      const totalRent = desiredLeases.reduce((sum, unit) => sum + (unit.price || 0), 0);
      const totalDeposit = desiredLeases.reduce((sum, unit) => sum + (unit.deposit || 0), 0);
      const primaryLease = desiredLeases[0];

      updateData.propertyId = targetPropertyId;
      updateData.unitType = primaryLease.unitType;
      updateData.unitIdentifier = primaryLease.unitIdentifier;
      updateData.houseNumber = primaryLease.houseNumber;
      updateData.price = totalRent;
      updateData.deposit = totalDeposit;
      updateData.leasedUnits = desiredLeases;
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

// DELETE: Remove tenant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (
    !ObjectId.isValid(tenantId) ||
    !userId ||
    !ObjectId.isValid(userId) ||
    !["propertyOwner", "teamMember"].includes(role || "")
  ) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  if (!(await validateCsrfToken(request))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    let effectiveOwnerId = userId;
    let requesterName = "Team member";

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(userId),
        active: true,
      });

      if (!teamMember || !teamMember.ownerId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }

      effectiveOwnerId = teamMember.ownerId.toString();
      requesterName = teamMember.name || teamMember.email || "Team member";
    }

    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: effectiveOwnerId,
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    if (role === "teamMember") {
      const existingRequest = await db.collection("tenant_deletion_requests").findOne({
        tenantId: new ObjectId(tenantId),
        ownerId: effectiveOwnerId,
        status: "Pending",
      });

      if (existingRequest) {
        return NextResponse.json({
          success: true,
          message: "Delete request already pending approval.",
        });
      }

      const now = new Date();
      const propertyObjectId = tenant.propertyId && ObjectId.isValid(tenant.propertyId)
        ? new ObjectId(tenant.propertyId)
        : undefined;

      const leaseUnitSummary = tenant.leasedUnits && tenant.leasedUnits.length > 0
        ? tenant.leasedUnits.map((unit) => unit.houseNumber).join(", ")
        : (tenant.houseNumber || tenant.unitType || tenant.unitIdentifier || "unit");

      const requestDoc = {
        tenantId: new ObjectId(tenantId),
        ownerId: effectiveOwnerId,
        requestedBy: userId,
        status: "Pending",
        createdAt: now,
        updatedAt: now,
        tenantName: tenant.name,
        propertyId: propertyObjectId,
        houseNumber: tenant.houseNumber,
        unitType: tenant.unitType,
        unitIdentifier: tenant.unitIdentifier,
        leasedUnits: tenant.leasedUnits,
        requesterName,
      };

      const insertResult = await db.collection("tenant_deletion_requests").insertOne(requestDoc as any);

      const unitLabel = leaseUnitSummary || "unit";
      const notificationMessage = `${requesterName} requested to delete tenant ${tenant.name}${unitLabel ? ` (${unitLabel})` : ""}. Approval required.`;

      await db.collection("notifications").insertOne({
        _id: new ObjectId(),
        message: notificationMessage,
        type: "tenant",
        createdAt: now.toISOString(),
        status: "unread",
        tenantId: tenant._id.toString(),
        tenantName: tenant.name,
        ownerId: effectiveOwnerId,
        deliveryMethod: "app",
        deliveryStatus: "success",
      });

      const property =
        tenant.propertyId && ObjectId.isValid(tenant.propertyId)
          ? await db.collection<Property>("properties").findOne({
              _id: new ObjectId(tenant.propertyId),
              ownerId: effectiveOwnerId,
            })
          : null;
      const owner = await db.collection("propertyOwners").findOne({
        _id: new ObjectId(effectiveOwnerId),
      });

      const propertyName = property?.name || "Property";
      const ownerName = owner?.name || "Property Owner";
      const ownerEmail = owner?.email;
      const ownerPhone = owner?.phone;
      const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/property-owner-dashboard`;

      const smsBase = `Deletion request: ${tenant.name} (${unitLabel}) at ${propertyName}. Requested by ${requesterName}. Review in dashboard.`;
      const smsMessage = smsBase;
      const waMessage = [
        `Tenant deletion request`,
        `Tenant: ${tenant.name}`,
        `Property: ${propertyName}`,
        unitLabel ? `Units: ${unitLabel}` : null,
        `Requested by: ${requesterName}`,
        `Review in dashboard: ${dashboardUrl}`,
      ].filter(Boolean).join("\n");

      try {
        if (ownerEmail) {
          await sendTenantDeletionRequestEmail({
            to: ownerEmail,
            ownerName,
            tenantName: tenant.name,
            propertyName,
            houseNumber: tenant.houseNumber,
            unitType: tenant.unitType,
            requestedBy: requesterName,
            dashboardUrl,
          });
        }
      } catch (err) {
        logger.error("Tenant deletion email failed", { error: (err as any)?.message || err });
      }

      try {
        if (ownerPhone) {
          await sendWelcomeSms({ phone: ownerPhone, message: smsMessage });
        }
      } catch (err) {
        logger.error("Tenant deletion SMS failed", { error: (err as any)?.message || err });
      }

      try {
        if (ownerPhone) {
          await sendWhatsAppMessage({ phone: ownerPhone, message: waMessage });
        }
      } catch (err) {
        logger.error("Tenant deletion WhatsApp failed", { error: (err as any)?.message || err });
      }

      logger.info("Tenant deletion requested", {
        tenantId,
        requestedBy: userId,
        ownerId: effectiveOwnerId,
        requestId: insertResult.insertedId.toString(),
      });

      return NextResponse.json({
        success: true,
        message: "Delete request sent to owner for approval.",
        requestId: insertResult.insertedId.toString(),
      });
    }

    // Delete tenant
    await db.collection<Tenant>("tenants").deleteOne({ _id: new ObjectId(tenantId) });

    // Keep payments for recordkeeping (do not delete tenant payments)
    const deletedCount = 0;

    logger.info("Tenant deleted", {
      tenantId,
      deletedPayments: deletedCount,
      paymentsPreserved: true,
    });

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

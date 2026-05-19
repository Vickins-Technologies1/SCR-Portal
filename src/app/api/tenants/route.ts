// src/app/api/tenants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../../../lib/email";
import { sendWelcomeSms } from "../../../lib/sms";
import { sendWhatsAppMessage } from "../../../lib/whatsapp";
import { TenantRequest, ResponseTenant, Tenant } from "../../../types/tenant";
import { Property } from "../../../types/property";
import { getOwnerDueStatus } from "../../../lib/billing";
import { buildInvalidCsrfResponse } from "../../../lib/csrf";
import { fetchTenantsActiveOnDay } from "@/lib/tenant-occupancy";
import { appendOwnerActivityFromRequest } from "@/lib/owner-activity";

const logger = {
  debug: (msg: string, meta?: any) => process.env.NODE_ENV !== "production" && console.debug(`[DEBUG] ${msg}`, meta || ""),
  info: (msg: string, meta?: any) => console.info(`[INFO] ${msg}`, meta || ""),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ""),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ""),
};

const validateCsrfToken = async (request: NextRequest): Promise<boolean> => {
  const csrfToken = request.headers.get("x-csrf-token");
  const cookieToken = (await cookies()).get("csrf-token")?.value;
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    logger.warn("Invalid CSRF token");
    return false;
  }
  return true;
};

const toISO = (date?: Date | string): string | undefined => date ? new Date(date).toISOString() : undefined;

const buildOccupiedByUnitIdentifier = async (
  db: Db,
  propertyId: string,
  excludeTenantId?: ObjectId,
  now: Date = new Date()
): Promise<Map<string, number>> => {
  const tenants = await fetchTenantsActiveOnDay<Tenant>(
    db,
    [propertyId],
    now,
    { leasedUnits: 1, unitIdentifier: 1, unitType: 1 },
    excludeTenantId
  );

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

// GET: List Tenants (with pagination & filters)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    const requestedOwnerId = searchParams.get("userId") || searchParams.get("ownerId");

    if (!sessionUserId || !ObjectId.isValid(sessionUserId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const { db } = await connectToDatabase();
    let effectiveOwnerId = sessionUserId;
    let teamMemberAssignedPropertyIds: string[] | null = null;

    if (role === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(sessionUserId),
        active: true,
      });

      if (!teamMember || !teamMember.ownerId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }

      const ownerIdFromTeam = teamMember.ownerId.toString();
      teamMemberAssignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
        ? Array.from(
            new Set(
              (teamMember as any).assignedPropertyIds
                .map((value: any) => String(value || "").trim())
                .filter((value: string) => value.length > 0)
            )
          )
        : null;
      if (requestedOwnerId && requestedOwnerId !== ownerIdFromTeam) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }

      effectiveOwnerId = ownerIdFromTeam;
    } else if (requestedOwnerId && requestedOwnerId !== sessionUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    if (!effectiveOwnerId || !ObjectId.isValid(effectiveOwnerId)) {
      return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
    }

    const filters: any = { ownerId: effectiveOwnerId, accountType: { $ne: "airbnb_guest" } };
    const andFilters: any[] = [];
    if (searchParams.get("name")) filters.name = { $regex: searchParams.get("name")!, $options: "i" };
    if (searchParams.get("email")) filters.email = { $regex: searchParams.get("email")!, $options: "i" };
    if (searchParams.get("phone")) filters.phone = { $regex: searchParams.get("phone")!, $options: "i" };
    const requestedPropertyId = searchParams.get("propertyId");
    if (requestedPropertyId) {
      if (
        role === "teamMember" &&
        teamMemberAssignedPropertyIds &&
        teamMemberAssignedPropertyIds.length > 0 &&
        !teamMemberAssignedPropertyIds.includes(requestedPropertyId)
      ) {
        return NextResponse.json({ success: true, tenants: [], total: 0, page, limit, totalPages: 0 }, { status: 200 });
      }
      filters.propertyId = requestedPropertyId;
    } else if (role === "teamMember" && teamMemberAssignedPropertyIds && teamMemberAssignedPropertyIds.length > 0) {
      filters.propertyId = { $in: teamMemberAssignedPropertyIds };
    }
    const unitTypeFilter = searchParams.get("unitType");
    if (unitTypeFilter) {
      const regex = { $regex: unitTypeFilter, $options: "i" };
      andFilters.push({
        $or: [
        { unitType: regex },
        { "leasedUnits.unitType": regex },
        { "leasedUnits.unitIdentifier": regex },
        ],
      });
    }

    const houseNumberFilter = searchParams.get("houseNumber");
    if (houseNumberFilter) {
      const regex = { $regex: houseNumberFilter, $options: "i" };
      andFilters.push({
        $or: [
          { houseNumber: regex },
          { "leasedUnits.houseNumber": regex },
        ],
      });
    }

    const statusFilter = searchParams.get("status");
    if (statusFilter) {
      filters.status = statusFilter;
    }

    const paymentStatusFilter = searchParams.get("paymentStatus");
    if (paymentStatusFilter) {
      filters.paymentStatus = paymentStatusFilter;
    }

    const minRentRaw = searchParams.get("minRent");
    const maxRentRaw = searchParams.get("maxRent");
    const minRent = minRentRaw ? Number(minRentRaw) : undefined;
    const maxRent = maxRentRaw ? Number(maxRentRaw) : undefined;
    if (Number.isFinite(minRent) || Number.isFinite(maxRent)) {
      filters.price = {
        ...(Number.isFinite(minRent) ? { $gte: minRent } : {}),
        ...(Number.isFinite(maxRent) ? { $lte: maxRent } : {}),
      };
    }

    if (andFilters.length > 0) {
      filters.$and = andFilters;
    }

    const total = await db.collection<Tenant>("tenants").countDocuments(filters);
    const tenants = await db.collection<Tenant>("tenants")
      .find(filters)
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      tenants: tenants.map((t): ResponseTenant => ({
        _id: t._id.toString(),
        ownerId: t.ownerId,
        name: t.name,
        email: t.email,
        phone: t.phone,
        role: t.role,
        propertyId: t.propertyId,
        unitType: t.unitType,
        unitIdentifier: t.unitIdentifier,
        price: t.price,
        deposit: t.deposit,
        houseNumber: t.houseNumber,
        leasedUnits: t.leasedUnits,
        leaseStartDate: t.leaseStartDate,
        leaseEndDate: t.leaseEndDate,
        status: t.status,
        paymentStatus: t.paymentStatus,
        createdAt: toISO(t.createdAt)!,
        updatedAt: toISO(t.updatedAt),
        totalRentPaid: t.totalRentPaid,
        totalUtilityPaid: t.totalUtilityPaid,
        totalDepositPaid: t.totalDepositPaid,
        walletBalance: t.walletBalance,
        deliveryMethod: t.deliveryMethod,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error("GET /api/tenants error", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// POST: Create New Tenant 
export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrfToken(request))) {
      return buildInvalidCsrfResponse(request);
    }

    const userId = (await cookies()).get("userId")?.value;
    const role = (await cookies()).get("role")?.value;

    if (!userId || !ObjectId.isValid(userId) || role !== "propertyOwner") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body: TenantRequest = await request.json();

    // Required fields
    const required = ["name", "email", "phone", "password", "propertyId", "leaseStartDate", "leaseEndDate"];
    const missing = required.filter(f => !body[f as keyof TenantRequest]);
    if (missing.length > 0) {
      return NextResponse.json({ success: false, message: `Missing fields: ${missing.join(", ")}` }, { status: 400 });
    }

    const leaseUnitInputs = Array.isArray(body.leasedUnits) && body.leasedUnits.length > 0
      ? body.leasedUnits
      : (body.unitIdentifier && body.houseNumber
          ? [{ unitIdentifier: body.unitIdentifier, houseNumber: body.houseNumber }]
          : []);

    if (leaseUnitInputs.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one unit (type and house number) is required." },
        { status: 400 }
      );
    }

    // Basic validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!/^\+?\d{10,15}$/.test(body.phone)) {
      return NextResponse.json({ success: false, message: "Invalid phone number" }, { status: 400 });
    }
    if (new Date(body.leaseEndDate) <= new Date(body.leaseStartDate)) {
      return NextResponse.json({ success: false, message: "Lease end date must be after start date" }, { status: 400 });
    }
    if (!ObjectId.isValid(body.propertyId)) {
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // ────────────────────────────────────────────────
    //           PREVENT DUPLICATE TENANTS (scoped to owner)
    // ────────────────────────────────────────────────

    // 1. Email already in use by this owner (case-insensitive)
    const duplicateEmail = await db.collection("tenants").findOne({
      ownerId: userId,
      email: { $regex: new RegExp(`^${body.email.trim()}$`, "i") }
    });
    if (duplicateEmail) {
      return NextResponse.json(
        { success: false, message: "A tenant with this email already exists under your account" },
        { status: 409 }
      );
    }

    // 2. Phone number already in use by this owner
    const duplicatePhone = await db.collection("tenants").findOne({
      ownerId: userId,
      phone: body.phone.trim()
    });
    if (duplicatePhone) {
      return NextResponse.json(
        { success: false, message: "A tenant with this phone number already exists under your account" },
        { status: 409 }
      );
    }

    const normalizedLeases = leaseUnitInputs.map((unit) => ({
      unitIdentifier: (unit.unitIdentifier || "").trim(),
      houseNumber: (unit.houseNumber || "").trim(),
    }));

    if (normalizedLeases.some((unit) => !unit.unitIdentifier || !unit.houseNumber)) {
      return NextResponse.json(
        { success: false, message: "Each leased unit must include a unit type and house number." },
        { status: 400 }
      );
    }

    const houseNumbers = normalizedLeases.map((unit) => unit.houseNumber);
    const uniqueHouseNumbers = new Set(houseNumbers.map((h) => h.toLowerCase()));
    if (uniqueHouseNumbers.size !== houseNumbers.length) {
      return NextResponse.json(
        { success: false, message: "House numbers must be unique within the same tenant." },
        { status: 400 }
      );
    }

    // 3. Unit already occupied in this property
    const duplicateUnit = await db.collection("tenants").findOne({
      propertyId: { $in: [body.propertyId, new ObjectId(body.propertyId)] },
      status: { $nin: ["terminated", "inactive", "moved out"] },
      $or: [
        { houseNumber: { $in: houseNumbers } },
        { "leasedUnits.houseNumber": { $in: houseNumbers } },
      ],
    });

    if (duplicateUnit) {
      return NextResponse.json(
        {
          success: false,
          message: `One or more unit numbers (${houseNumbers.join(", ")}) are already occupied`,
        },
        { status: 409 }
      );
    }

    // ────────────────────────────────────────────────
    // Proceed only if no duplicates found
    // ────────────────────────────────────────────────

    // Validate property ownership
    const property = await db.collection<Property>("properties").findOne({
      _id: new ObjectId(body.propertyId),
      ownerId: userId,
    });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found or not owned by you" }, { status: 404 });
    }

    // Handle properties with and without uniqueType
    const unitConfigs = property.unitTypes.map((unit, index) => ({
      ...unit,
      uniqueType: unit.uniqueType || `${unit.type}-${index}`,
    }));

    const configById = new Map(unitConfigs.map((unit) => [unit.uniqueType, unit]));
    const requestedCounts = new Map<string, number>();
    const leasedUnits: Tenant["leasedUnits"] = [];

    for (const lease of normalizedLeases) {
      const config = configById.get(lease.unitIdentifier);
      if (!config) {
        return NextResponse.json(
          { success: false, message: `Invalid unit type selected: ${lease.unitIdentifier}` },
          { status: 400 }
        );
      }
      const count = requestedCounts.get(lease.unitIdentifier) || 0;
      requestedCounts.set(lease.unitIdentifier, count + 1);
      leasedUnits.push({
        unitIdentifier: config.uniqueType,
        unitType: config.type,
        houseNumber: lease.houseNumber,
        price: config.price,
        deposit: config.deposit,
      });
    }

    const occupiedByUnit = await buildOccupiedByUnitIdentifier(db, body.propertyId, undefined, new Date());

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
            message: `Not enough available units for ${config.type} (${config.price.toLocaleString()} Ksh). Requested ${count}, available ${available}.`,
          },
          { status: 400 }
        );
      }
    }
    const dueStatus = await getOwnerDueStatus(db, userId, new Date());
    if (dueStatus.isDue) {
      return NextResponse.json(
        { success: false, message: "Payment required: Outstanding invoice past grace period. Please pay your invoice to continue." },
        { status: 402 }
      );
    }
    // Create tenant
    const totalRent = leasedUnits.reduce((sum: number, unit: { price?: number }) => sum + (unit.price || 0), 0);
    const totalDeposit = leasedUnits.reduce((sum: number, unit: { deposit?: number }) => sum + (unit.deposit || 0), 0);
    const primaryLease = leasedUnits[0];

    const tenantData: Tenant = {
      _id: new ObjectId(),
      ownerId: userId,
      name: body.name.trim(),
      email: body.email.trim(),
      phone: body.phone.trim(),
      password: await bcrypt.hash(body.password!, 10),
      role: "tenant",
      propertyId: body.propertyId,
      unitType: primaryLease.unitType,
      unitIdentifier: primaryLease.unitIdentifier,
      price: totalRent,
      deposit: totalDeposit,
      houseNumber: primaryLease.houseNumber,
      leasedUnits,
      leaseStartDate: body.leaseStartDate,
      leaseEndDate: body.leaseEndDate,
      status: "active",
      paymentStatus: "current",
      createdAt: new Date(),
      updatedAt: new Date(),
      totalRentPaid: 0,
      totalUtilityPaid: 0,
      totalDepositPaid: 0,
      walletBalance: 0,
      deliveryMethod: "both",
    };

    const result = await db.collection<Tenant>("tenants").insertOne(tenantData);

    await appendOwnerActivityFromRequest(db, request, {
      action: "tenants.create",
      summary: `Added tenant: ${tenantData.name}.`,
      entity: { type: "tenant", id: result.insertedId.toString(), label: tenantData.name },
      metadata: {
        propertyId: body.propertyId,
        units: leasedUnits.map((unit) => ({
          houseNumber: unit.houseNumber,
          unitType: unit.unitType,
          unitIdentifier: unit.unitIdentifier,
        })),
      },
    });

    // ────────────────────────────────────────────────
    //          Welcome notifications with password
    // ────────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const loginUrl = `${baseUrl}/tenant-login`;

    const unitSummary = leasedUnits
      .map((unit) => `${unit.houseNumber} (${unit.unitType})`)
      .join(", ");

    // Full SMS (auto-split into multi-part messages if needed)
    const smsMessage =
      `Welcome ${body.name.trim()}!\n` +
      `Property: ${property.name}\n` +
      `Units: ${unitSummary}\n` +
      `Login: ${loginUrl}\n` +
      `Email: ${body.email.trim()}\n` +
      `Password: ${body.password!}\n` +
      `Please change your password after first login.`;

    // Longer version for Email + WhatsApp
    const fullMessage =
      `Welcome ${body.name.trim()}!\n\n` +
      `You've been added as a tenant to ${property.name}.\n` +
      `Units: ${unitSummary}\n\n` +
      `Login here: ${loginUrl}\n` +
      `Email:    ${body.email.trim()}\n` +
      `Password: ${body.password!}\n\n` +
      `⚠️ IMPORTANT: Change your password immediately after first login!\n` +
      `Go to account settings → Change Password.\n` +
      `Never share this password.`;

    try {
      await sendWelcomeEmail({
        to: body.email,
        name: body.name,
        email: body.email,
        password: body.password!,
        loginUrl,
        propertyName: property.name,
        houseNumber: body.houseNumber,
      });
    } catch (e) { logger.error("Welcome email failed", e); }

    try {
      await sendWelcomeSms({
        phone: body.phone,
        message: smsMessage,
      });
    } catch (e) { logger.error("Welcome SMS failed", e); }

    try {
      await sendWhatsAppMessage({
        phone: body.phone,
        message: fullMessage,
      });
    } catch (e) { logger.error("Welcome WhatsApp failed", e); }

    logger.info("Tenant created successfully", {
      tenantId: result.insertedId.toString(),
      unitIdentifier: primaryLease.unitIdentifier,
    });

    return NextResponse.json({
      success: true,
      message: "Tenant added successfully",
      tenantId: result.insertedId.toString(),
    }, { status: 201 });

  } catch (error: any) {
    logger.error("POST /api/tenants error", { error: error.message, stack: error.stack });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}




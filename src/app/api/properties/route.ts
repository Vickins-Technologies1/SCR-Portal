// src/app/api/properties/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { cookies } from 'next/headers';
import { Db, ObjectId } from 'mongodb';
import { UNIT_TYPES } from '../../../lib/unitTypes';
import { Property, PropertyUtility, UnitType } from '../../../types/property';
import { Tenant } from '../../../types/tenant';
import { buildInvalidCsrfResponse } from '../../../lib/csrf';
import { fetchTenantsActiveOnDay } from '@/lib/tenant-occupancy';
import { resolveAccountTier } from '@/lib/tier';
import { appendOwnerActivityFromRequest } from '@/lib/owner-activity';
import { sanitizePropertyUtilities } from '@/lib/property-utilities';

const buildOccupiedByUnitIdentifier = async (
  db: Db,
  propertyId: string,
  now: Date = new Date()
): Promise<Map<string, number>> => {
  const tenants = await fetchTenantsActiveOnDay<Tenant>(
    db,
    [propertyId],
    now,
    { leasedUnits: 1, unitIdentifier: 1, unitType: 1 }
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

// Logger (aligned with tenant route handler)
interface LogMeta {
  [key: string]: unknown;
}

const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${message}`, meta || '');
    return { message, meta, level: 'warn' };
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || '');
    return { message, meta, level: 'error' };
  },
  info: (message: string, meta?: LogMeta) => {
    console.info(`[INFO] ${message}`, meta || '');
    return { message, meta, level: 'info' };
  },
};

// Helper to convert potential Date or undefined to ISO string
const toISOStringSafe = (value: Date | undefined, field: string): string => {
  if (!value) {
    logger.warn(`Empty value for ${field}, returning empty string`, { value, field });
    return '';
  }
  try {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString();
    }
    logger.warn(`Invalid Date object for ${field}, returning empty string`, { value, field });
    return '';
  } catch (error) {
    logger.error(`Error converting ${field} to ISO string`, {
      value,
      field,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return '';
  }
};

// Shared CSRF token validation function
async function validateCsrfToken(req: NextRequest, token: string | null): Promise<boolean> {
  const storedToken = req.cookies.get('csrf-token')?.value;
  const submittedToken = token || req.headers.get('x-csrf-token');
  logger.debug('CSRF Token Validation', {
    headerCsrfToken: submittedToken,
    cookieCsrfToken: storedToken,
    path: req.nextUrl.pathname,
  });
  if (!submittedToken || !storedToken) {
    logger.warn('CSRF token missing', {
      headerCsrfToken: submittedToken,
      cookieCsrfToken: storedToken,
      path: req.nextUrl.pathname,
    });
    return false;
  }
  if (submittedToken !== storedToken) {
    logger.warn('CSRF token mismatch', {
      headerCsrfToken: submittedToken,
      cookieCsrfToken: storedToken,
      path: req.nextUrl.pathname,
    });
    return false;
  }
  logger.debug('CSRF token validated successfully', {
    headerCsrfToken: submittedToken,
    path: req.nextUrl.pathname,
  });
  return true;
}

export async function GET(request: NextRequest) {
  try {
    logger.debug('Handling GET request to /api/properties', { path: request.nextUrl.pathname });
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId') || searchParams.get('tenantId') || searchParams.get('ownerId');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const loggedInUserId = cookieStore.get('userId')?.value;

    const { db } = await connectToDatabase();
    logger.debug('Connected to MongoDB database: rentaldb');

    if (role === 'admin') {
      const properties = await db.collection<Property>('propertyListings').find().toArray();
      return NextResponse.json(
        {
          success: true,
          properties: properties.map((p) => ({
            ...p,
            _id: p._id.toString(),
            createdAt: toISOStringSafe(p.createdAt, 'property.createdAt'),
            updatedAt: toISOStringSafe(p.updatedAt, 'property.updatedAt'),
          })),
        },
        { status: 200 }
      );
    }

    if (!requestedUserId || !ObjectId.isValid(requestedUserId)) {
      logger.warn('Invalid or missing user ID', { requestedUserId });
      return NextResponse.json(
        { success: false, message: 'Valid user ID is required' },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────────
    //   Authorization: propertyOwner or authorized teamMember
    // ────────────────────────────────────────────────────────────────
    let authorized = false;
    const effectiveOwnerId = requestedUserId;
    let teamMemberAssignedPropertyIds: string[] | null = null;

    if (role === 'propertyOwner') {
      if (loggedInUserId === requestedUserId) {
        authorized = true;
      }
    } else if (role === 'teamMember') {
      if (!loggedInUserId) {
        logger.warn('Team member missing loggedInUserId', { requestedUserId });
      } else {
        const teamMember = await db.collection('teamMembers').findOne({
          _id: new ObjectId(loggedInUserId),
          ownerId: new ObjectId(requestedUserId),
          active: true,
        });

        if (teamMember) {
          authorized = true;
          teamMemberAssignedPropertyIds = Array.isArray((teamMember as any).assignedPropertyIds)
            ? Array.from(
                new Set(
                  (teamMember as any).assignedPropertyIds
                    .map((value: any) => String(value || '').trim())
                    .filter((value: string) => ObjectId.isValid(value))
                )
              )
            : null;
          logger.info('Team member authorized for owner data', {
            teamMemberId: loggedInUserId,
            ownerId: requestedUserId,
          });
        } else {
          logger.warn('Team member not authorized for this owner', {
            teamMemberId: loggedInUserId,
            requestedOwnerId: requestedUserId,
          });
        }
      }
    } else if (role === 'tenant') {
      // Tenant logic remains unchanged (single property)
      authorized = true; // will be checked later in tenant block
    } else {
      logger.warn('Unauthorized: Invalid role', { role, requestedUserId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Invalid role' },
        { status: 401 }
      );
    }

    if (!authorized && role !== 'tenant') {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Not authorized for this owner' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────────
    //           PROPERTY OWNER / TEAM MEMBER – enriched with occupiedUnits
    // ────────────────────────────────────────────────────────────────
    if (role === 'propertyOwner' || role === 'teamMember') {
      const propertyQuery: any = { ownerId: effectiveOwnerId };
      if (role === 'teamMember' && teamMemberAssignedPropertyIds && teamMemberAssignedPropertyIds.length > 0) {
        propertyQuery._id = { $in: teamMemberAssignedPropertyIds.map((id) => new ObjectId(id)) };
      }

      const properties = await db
        .collection<Property>('properties')
        .find(propertyQuery)
        .toArray();

      // Enrich each property with occupied units count
      const now = new Date();
      const enrichedProperties = await Promise.all(
        properties.map(async (prop) => {
          const occupiedByUnit = await buildOccupiedByUnitIdentifier(db, prop._id.toString(), now);
          const occupiedCount = Array.from(occupiedByUnit.values()).reduce((sum, count) => sum + count, 0);
          const unitTypes = (prop.unitTypes || []).map((unit, index) => {
            const uniqueType = unit.uniqueType || `${unit.type}-${index}`;
            const occupied = occupiedByUnit.get(uniqueType) ?? occupiedByUnit.get(unit.type) ?? 0;
            const totalQuantity = typeof unit.quantity === 'number' ? unit.quantity : 0;
            const available = Math.max(0, totalQuantity - occupied);
            return {
              ...unit,
              uniqueType,
              available,
            };
          });

          return {
            ...prop,
            _id: prop._id.toString(),
            createdAt: toISOStringSafe(prop.createdAt, 'property.createdAt'),
            updatedAt: toISOStringSafe(prop.updatedAt, 'property.updatedAt'),
            occupiedUnits: occupiedCount,
            unitTypes,
          };
        })
      );

      logger.info(`Returning ${enrichedProperties.length} properties with occupancy info`, {
        ownerId: effectiveOwnerId,
        count: enrichedProperties.length,
        accessedBy: role === 'teamMember' ? 'teamMember' : 'owner',
      });

      return NextResponse.json(
        {
          success: true,
          properties: enrichedProperties,
        },
        { status: 200 }
      );
    }

    // ────────────────────────────────────────────────────────────────
    //           TENANT – single property (unchanged)
    // ────────────────────────────────────────────────────────────────
    if (role === 'tenant') {
      const tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(requestedUserId),
      });

      if (!tenant) {
        logger.warn('Tenant not found for userId', { requestedUserId });
        return NextResponse.json(
          { success: false, message: 'Tenant not found' },
          { status: 404 }
        );
      }

      const property = await db.collection<Property>('propertyListings').findOne({
        _id: new ObjectId(tenant.propertyId),
      });

      if (!property) {
        logger.warn('Property not found for tenant propertyId', { propertyId: tenant.propertyId });
        return NextResponse.json(
          { success: false, message: 'Property not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          property: {
            ...property,
            _id: property._id.toString(),
            createdAt: toISOStringSafe(property.createdAt, 'property.createdAt'),
            updatedAt: toISOStringSafe(property.updatedAt, 'property.updatedAt'),
          },
        },
        { status: 200 }
      );
    }
  } catch (error: unknown) {
    logger.error('Error fetching properties', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    logger.debug('Handling POST request to /api/properties', { path: request.nextUrl.pathname });
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const ownerId = cookieStore.get('userId')?.value;

    // Validate CSRF token
    const body = await request.json();
    const csrfToken = body.csrfToken || request.headers.get('x-csrf-token');
    if (!await validateCsrfToken(request, csrfToken)) {
      logger.warn('Invalid CSRF token', { ownerId, csrfToken });
      return buildInvalidCsrfResponse(request);
    }

    if (role !== 'propertyOwner' || !ownerId || !ObjectId.isValid(ownerId)) {
      logger.warn('Unauthorized or invalid ownerId', { role, ownerId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid owner ID' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    logger.debug('Connected to MongoDB database: rentaldb');

    // Free tier: allow only 1 property for life
    const tierCookie = cookieStore.get('tier')?.value;
    let accountTier = resolveAccountTier(tierCookie, 'premium');

    if (!tierCookie) {
      const ownerDoc = await db.collection('propertyOwners').findOne(
        { _id: new ObjectId(ownerId) },
        { projection: { tier: 1 } }
      );
      accountTier = resolveAccountTier(ownerDoc?.tier, 'premium');
    }

    if (accountTier === 'free') {
      const existingProperties = await db.collection<Property>('properties').countDocuments({ ownerId });
      if (existingProperties >= 1) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Free tier includes 1 property for life. Upgrade to Premium to add more properties and unlock automated tenant payments.",
            code: "FREE_TIER_PROPERTY_LIMIT",
          },
          { status: 403 }
        );
      }
    }
    const { name, address, unitTypes, status, rentPaymentDate, billingType, penaltyAmount, penaltyFrequency, utilities } = body;

    if (
      !name ||
      !address ||
      !unitTypes ||
      !Array.isArray(unitTypes) ||
      unitTypes.length === 0 ||
      !status ||
      !Number.isInteger(rentPaymentDate) ||
      rentPaymentDate < 1 ||
      rentPaymentDate > 28
    ) {
      logger.warn('Missing or invalid required fields', { name, address, unitTypes, status, rentPaymentDate });
      return NextResponse.json(
        { success: false, message: 'Missing or invalid required fields. Rent payment date must be between 1 and 28.' },
        { status: 400 }
      );
    }
    if (billingType && !['RentCollection', 'FullManagement'].includes(billingType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid billingType. Must be RentCollection or FullManagement.' },
        { status: 400 }
      );
    }

    const parsedPenaltyAmount =
      penaltyAmount === null || penaltyAmount === undefined || penaltyAmount === ""
        ? 0
        : Number(penaltyAmount);

    if (Number.isNaN(parsedPenaltyAmount) || parsedPenaltyAmount < 0) {
      return NextResponse.json(
        { success: false, message: 'Penalty amount must be a non-negative number.' },
        { status: 400 }
      );
    }

    if (parsedPenaltyAmount > 0 && !['daily', 'weekly'].includes(penaltyFrequency)) {
      return NextResponse.json(
        { success: false, message: 'Penalty frequency must be daily or weekly when a penalty amount is set.' },
        { status: 400 }
      );
    }

    const billingPlan = billingType === 'FullManagement' ? 'FullManagement' : 'RentCollection';

    // Validate unit types and calculate total units
    let totalUnits = 0;
    const validatedUnitTypes: UnitType[] = unitTypes.map((unit: any, index: number) => {
      const validUnitType = UNIT_TYPES.find((ut) => ut.type === unit.type);
      if (
        !unit.type ||
        !validUnitType ||
        typeof unit.quantity !== 'number' ||
        unit.quantity < 0 ||
        typeof unit.price !== 'number' ||
        unit.price < 0 ||
        typeof unit.deposit !== 'number' ||
        unit.deposit < 0
      ) {
        throw new Error(`Invalid unit type at index ${index}: ${JSON.stringify(unit)}`);
      }
      totalUnits += unit.quantity;
      return {
        type: unit.type,
        uniqueType: `${unit.type}-${index}`,
        quantity: unit.quantity,
        price: unit.price,
        deposit: unit.deposit,
        managementType: billingPlan,
        managementFee: 0, // Set to 0 as fee will be calculated for total units
      };
    });

    const managementFee = 0;
    let validatedUtilities: PropertyUtility[] = [];
    try {
      validatedUtilities = sanitizePropertyUtilities(utilities);
    } catch (error) {
      return NextResponse.json(
        { success: false, message: error instanceof Error ? error.message : 'Invalid property utilities.' },
        { status: 400 }
      );
    }

    const newProperty: Property = {
      _id: new ObjectId(),
      name,
      address,
      unitTypes: validatedUnitTypes,
      status,
      ownerId,
      rentPaymentDate,
      ...(parsedPenaltyAmount > 0 && penaltyFrequency
        ? { penaltyAmount: parsedPenaltyAmount, penaltyFrequency }
        : {}),
      utilities: validatedUtilities,
      billingType: billingPlan,
      managementFee,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<Property>('properties').insertOne(newProperty);

    await appendOwnerActivityFromRequest(db, request, {
      action: 'properties.create',
      summary: `Created property: ${name}.`,
      entity: { type: 'property', id: result.insertedId.toString(), label: name },
      metadata: { status, billingType: billingPlan, rentPaymentDate, utilityCount: validatedUtilities.length },
    });

    return NextResponse.json(
      {
        success: true,
        property: {
          ...newProperty,
          _id: result.insertedId.toString(),
          createdAt: toISOStringSafe(newProperty.createdAt, 'newProperty.createdAt'),
          updatedAt: toISOStringSafe(newProperty.updatedAt, 'newProperty.updatedAt'),
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error('Error creating property', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}













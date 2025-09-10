import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { UNIT_TYPES, getManagementFee } from '../../../lib/unitTypes';
import { Property, UnitType } from '../../../types/property';
import { Tenant } from '../../../types/tenant';
import { sendWhatsAppMessage } from '../../../lib/whatsapp';

// Define Invoice interface for type safety
interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  unitType: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  description: string;
}

// Define PropertyOwner interface for retrieving phone number
interface PropertyOwner {
  _id: ObjectId;
  phone: string;
}

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
    // Check for userId, tenantId, or ownerId in query parameters
    const userId = searchParams.get('userId') || searchParams.get('tenantId') || searchParams.get('ownerId');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;

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

    if (!userId || !ObjectId.isValid(userId)) {
      logger.warn('Invalid or missing user ID', { userId });
      return NextResponse.json(
        { success: false, message: 'Valid user ID is required' },
        { status: 400 }
      );
    }

    if (!role || (role !== 'propertyOwner' && role !== 'tenant')) {
      logger.warn('Unauthorized: Invalid role', { role });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Invalid role' },
        { status: 401 }
      );
    }

    if (role === 'propertyOwner') {
      const properties = await db
        .collection<Property>('properties')
        .find({ ownerId: userId })
        .toArray();
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

    if (role === 'tenant') {
      const tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(userId),
      });

      if (!tenant) {
        logger.warn('Tenant not found for userId', { userId });
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
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
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
    const { name, address, unitTypes, status, rentPaymentDate } = body;

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

    // Validate unit types and calculate total units
    let totalUnits = 0;
    const validatedUnitTypes: UnitType[] = unitTypes.map((unit: UnitType, index: number) => {
      const validUnitType = UNIT_TYPES.find((ut) => ut.type === unit.type);
      if (
        !unit.type ||
        !validUnitType ||
        typeof unit.quantity !== 'number' ||
        unit.quantity < 0 ||
        typeof unit.price !== 'number' ||
        unit.price < 0 ||
        typeof unit.deposit !== 'number' ||
        unit.deposit < 0 ||
        !['RentCollection', 'FullManagement'].includes(unit.managementType)
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
        managementType: unit.managementType,
        managementFee: 0, // Set to 0 as fee will be calculated for total units
      };
    });

    // Calculate management fee based on total units
    const managementFee = getManagementFee({
      type: validatedUnitTypes[0].type, // Use first unit type for pricing tier lookup
      managementType: validatedUnitTypes[0].managementType, // Use first management type
      quantity: totalUnits,
    });

    const newProperty: Property = {
      _id: new ObjectId(),
      name,
      address,
      unitTypes: validatedUnitTypes,
      status,
      ownerId,
      rentPaymentDate,
      managementFee,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<Property>('properties').insertOne(newProperty);

    // Generate a single invoice for the property if management fee is non-zero
    if (managementFee > 0) {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt);
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const invoice: Omit<Invoice, '_id'> = {
        userId: ownerId,
        propertyId: result.insertedId.toString(),
        unitType: 'All Units',
        amount: managementFee,
        reference: `PROPERTY-INVOICE-${ownerId}-ALL-UNITS-${Date.now()}`,
        status: 'pending',
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        description: `Property management fee for ${name} - Total Units: ${totalUnits}`,
      };

      const invoiceResult = await db.collection<Omit<Invoice, '_id'>>('invoices').insertOne(invoice);
      logger.info('Generated invoice for property', {
        invoiceId: invoiceResult.insertedId.toString(),
        propertyId: result.insertedId.toString(),
        totalUnits,
        managementFee,
        invoice,
      });

      // Retrieve owner's phone number
      const owner = await db.collection<PropertyOwner>('propertyOwners').findOne({
        _id: new ObjectId(ownerId),
      });

      if (!owner || !owner.phone) {
        logger.warn('Owner phone number not found', { ownerId });
      } else {
        // Send WhatsApp message to owner
        try {
          const maxPropertyNameLength = 50; // Lenient for WhatsApp's 4096-char limit
          const truncatedPropertyName = name.length > maxPropertyNameLength
            ? `${name.substring(0, maxPropertyNameLength)}...`
            : name;

          const paymentUrl = process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://app.smartchoicerentalmanagement.com/';
          const whatsAppMessage = `Greetings, a new invoice has been generated for your property "${truncatedPropertyName}". Management Fee: ${managementFee}. Please pay by ${expiresAt.toLocaleDateString()} at ${paymentUrl}. Reference: ${invoice.reference} to add tenants.`;

          if (whatsAppMessage.length > 4096) {
            logger.warn('WhatsApp message exceeds 4096 characters', {
              messageLength: whatsAppMessage.length,
              ownerId,
            });
            const fallbackMessage = `New invoice for "${truncatedPropertyName}". Fee: ${managementFee}. Pay by ${expiresAt.toLocaleDateString()} at ${paymentUrl}. Ref: ${invoice.reference}.`;
            await sendWhatsAppMessage({
              phone: owner.phone,
              message: fallbackMessage,
            });
          } else {
            await sendWhatsAppMessage({
              phone: owner.phone,
              message: whatsAppMessage,
            });
          }
          logger.info('WhatsApp message sent successfully', { phone: owner.phone });
        } catch (whatsAppError) {
          logger.error('Failed to send WhatsApp message', {
            phone: owner.phone,
            error: whatsAppError instanceof Error ? whatsAppError.message : 'Unknown error',
          });
          // Continue even if WhatsApp message fails
        }
      }
    } else {
      logger.info('No management fee for property, skipping invoice generation', {
        propertyId: result.insertedId.toString(),
        totalUnits,
      });
    }

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
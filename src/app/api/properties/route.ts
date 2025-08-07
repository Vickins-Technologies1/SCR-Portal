import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { UNIT_TYPES, getManagementFee } from '../../../lib/unitTypes';
import { Property, UnitType } from '../../../types/property';
import { Tenant } from '../../../types/tenant';

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

// Shared CSRF token validation function
async function validateCsrfToken(req: NextRequest, token: string | null): Promise<boolean> {
  const storedToken = req.cookies.get('csrf-token')?.value;
  const submittedToken = token || req.headers.get('x-csrf-token');
  return !!submittedToken && storedToken === submittedToken;
}

export async function GET(request: NextRequest) {
  try {
    console.log('Handling GET request to /api/properties');
    const { searchParams } = new URL(request.url);
    // Check for userId, tenantId, or ownerId in query parameters
    const userId = searchParams.get('userId') || searchParams.get('tenantId') || searchParams.get('ownerId');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB database: rentaldb');

    if (role === 'admin') {
      const properties = await db.collection<Property>('propertyListings').find().toArray();
      return NextResponse.json(
        {
          success: true,
          properties: properties.map((p) => ({
            ...p,
            _id: p._id.toString(),
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          })),
        },
        { status: 200 }
      );
    }

    if (!userId || !ObjectId.isValid(userId)) {
      console.log('Invalid or missing user ID:', userId);
      return NextResponse.json(
        { success: false, message: 'Valid user ID is required' },
        { status: 400 }
      );
    }

    if (!role || (role !== 'propertyOwner' && role !== 'tenant')) {
      console.log('Unauthorized: Invalid role:', role);
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
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
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
        console.log('Tenant not found for userId:', userId);
        return NextResponse.json(
          { success: false, message: 'Tenant not found' },
          { status: 404 }
        );
      }

      const property = await db.collection<Property>('propertyListings').findOne({
        _id: new ObjectId(tenant.propertyId),
      });

      if (!property) {
        console.log('Property not found for tenant propertyId:', tenant.propertyId);
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
            createdAt: property.createdAt.toISOString(),
            updatedAt: property.updatedAt.toISOString(),
          },
        },
        { status: 200 }
      );
    }
  } catch (error: unknown) {
    console.error('Error fetching properties:', {
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
    console.log('Handling POST request to /api/properties');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const ownerId = cookieStore.get('userId')?.value;

    // Validate CSRF token
    const body = await request.json();
    const csrfToken = body.csrfToken || request.headers.get('x-csrf-token');
    if (!await validateCsrfToken(request, csrfToken)) {
      console.log('Invalid CSRF token', { ownerId, csrfToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    if (role !== 'propertyOwner' || !ownerId || !ObjectId.isValid(ownerId)) {
      console.log('Unauthorized or invalid ownerId:', { role, ownerId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid owner ID' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB database: rentaldb');
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
      console.log('Missing or invalid required fields:', { name, address, unitTypes, status, rentPaymentDate });
      return NextResponse.json(
        { success: false, message: 'Missing or invalid required fields. Rent payment date must be between 1 and 28.' },
        { status: 400 }
      );
    }

    // Validate unit types and assign management fees
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
      const managementFee = getManagementFee({
        type: unit.type,
        managementType: unit.managementType,
        quantity: unit.quantity,
      });
      return {
        type: unit.type,
        quantity: unit.quantity,
        price: unit.price,
        deposit: unit.deposit,
        managementType: unit.managementType,
        managementFee,
      };
    });

    const newProperty: Property = {
      _id: new ObjectId(),
      name,
      address,
      unitTypes: validatedUnitTypes,
      status,
      ownerId,
      rentPaymentDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<Property>('properties').insertOne(newProperty);

    // Generate invoices for each unit type with a non-zero management fee
    for (const [index, unit] of validatedUnitTypes.entries()) {
      if (unit.managementFee && unit.managementFee > 0) {
        const createdAt = new Date();
        const expiresAt = new Date(createdAt);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const invoice: Omit<Invoice, '_id'> = {
          userId: ownerId,
          propertyId: result.insertedId.toString(),
          unitType: `${unit.type}-${index}`, // Append index to differentiate same unit types
          amount: unit.managementFee,
          reference: `PROPERTY-INVOICE-${ownerId}-${unit.type}-${index}-${Date.now()}`,
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
          expiresAt,
          description: `Property creation fee for ${name} - Unit Type: ${unit.type} (${index + 1})`,
        };

        const invoiceResult = await db.collection<Omit<Invoice, '_id'>>('invoices').insertOne(invoice);
        console.log('Generated invoice for unit type:', {
          invoiceId: invoiceResult.insertedId.toString(),
          unitType: unit.type,
          unitIndex: index,
          propertyId: result.insertedId.toString(),
          invoice,
        });
      } else {
        console.log('No management fee for unit type, skipping invoice generation:', {
          unitType: unit.type,
          unitIndex: index,
          propertyId: result.insertedId.toString(),
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        property: {
          ...newProperty,
          _id: result.insertedId.toString(),
          createdAt: newProperty.createdAt.toISOString(),
          updatedAt: newProperty.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating property:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
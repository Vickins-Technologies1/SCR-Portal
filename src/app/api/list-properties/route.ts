
// src/app/api/list-properties/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { UNIT_TYPES } from '@/lib/unitTypes';
import logger from '@/lib/logger';
import { validateCsrfToken } from '@/lib/csrf';

interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

interface PropertyListing {
  _id: ObjectId;
  name: string;
  address: string;
  description?: string;
  facilities: string[];
  unitTypes: UnitType[];
  status: 'Active' | 'Inactive';
  ownerId: string;
  isAdvertised: boolean;
  adExpiration?: Date;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

const FACILITIES = [
  'Wi-Fi',
  'Parking',
  'Gym',
  'Swimming Pool',
  'Security',
  'Elevator',
  'Air Conditioning',
  'Heating',
  'Balcony',
  'Garden',
];

export async function GET(request: NextRequest) {
  try {
    console.log('Handling GET request to /api/list-properties');
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')));
    const sort = searchParams.get('sort') || '-createdAt';
    const userId = searchParams.get('userId');

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB database: rentaldb');

    const query: { ownerId?: string } = {};
    if (userId && ObjectId.isValid(userId)) {
      query.ownerId = userId;
    }

    const total = await db.collection<PropertyListing>('propertyListings').countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;

    const properties = await db
      .collection<PropertyListing>('propertyListings')
      .find(query)
      .sort({ createdAt: sort === '-createdAt' ? -1 : 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    logger.debug('Properties fetched', {
      page,
      limit,
      total,
      propertiesCount: properties.length,
      userId,
    });

    return NextResponse.json(
      {
        success: true,
        properties: properties.map((p) => ({
          ...p,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          adExpiration: p.adExpiration ? p.adExpiration.toISOString() : undefined,
          facilities: p.facilities || [],
        })),
        total,
        page,
        limit,
        totalPages,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('Error fetching properties:', {
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
    console.log('Handling POST request to /api/list-properties');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const userId = cookieStore.get('userId')?.value;

    if (!role || role !== 'propertyOwner' || !userId || !ObjectId.isValid(userId)) {
      logger.error('Unauthorized or invalid userId', { role, userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid user ID' },
        { status: 401 }
      );
    }

    // Extract CSRF token from headers
    const csrfToken = request.headers.get('X-CSRF-Token');
    if (!validateCsrfToken(request, csrfToken)) {
      logger.error('Invalid CSRF token', { userId, csrfToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, address, description, facilities, unitTypes, status, isAdvertised, ownerId, images } = body;

    // Verify ownerId matches cookie
    if (ownerId !== userId) {
      logger.error('Mismatched ownerId', { ownerId, cookieUserId: userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Owner ID does not match session' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (
      !name ||
      typeof name !== 'string' ||
      !address ||
      typeof address !== 'string' ||
      !unitTypes ||
      !Array.isArray(unitTypes) ||
      unitTypes.length === 0 ||
      !status ||
      !['Active', 'Inactive'].includes(status) ||
      typeof isAdvertised !== 'boolean'
    ) {
      logger.error('Missing or invalid required fields', { name, address, unitTypes, status, isAdvertised });
      return NextResponse.json(
        { success: false, message: 'Missing or invalid required fields' },
        { status: 400 }
      );
    }

    // Validate description
    if (description && (typeof description !== 'string' || description.length > 500)) {
      logger.error('Invalid description', { description });
      return NextResponse.json(
        { success: false, message: 'Description must be a string with maximum 500 characters' },
        { status: 400 }
      );
    }

    // Validate facilities
    if (facilities && !Array.isArray(facilities)) {
      logger.error('Facilities must be an array', { facilities });
      return NextResponse.json(
        { success: false, message: 'Facilities must be an array' },
        { status: 400 }
      );
    }
    const validFacilities = facilities ? facilities.filter((f: string) => FACILITIES.includes(f)) : [];
    if (validFacilities.length > 10) {
      logger.error('Too many facilities', { facilitiesCount: validFacilities.length });
      return NextResponse.json(
        { success: false, message: 'Maximum 10 facilities allowed' },
        { status: 400 }
      );
    }

    // Validate images
    if (!images || !Array.isArray(images) || images.some((img: unknown) => typeof img !== 'string')) {
      logger.error('Invalid images array', { images });
      return NextResponse.json(
        { success: false, message: 'Images must be an array of strings' },
        { status: 400 }
      );
    }
    if (images.length > 9) {
      logger.error('Too many images', { imageCount: images.length });
      return NextResponse.json(
        { success: false, message: 'Maximum 9 images allowed' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB database: rentaldb');

    // Validate unit types and check for duplicates
    const unitTypeSet = new Set<string>();
    const validatedUnitTypes: UnitType[] = unitTypes.map((unit: UnitType, index: number) => {
      if (
        !unit.type ||
        !UNIT_TYPES.some((ut) => ut.type === unit.type) ||
        unitTypeSet.has(unit.type) ||
        typeof unit.quantity !== 'number' ||
        unit.quantity < 0 ||
        typeof unit.price !== 'number' ||
        unit.price < 0 ||
        typeof unit.deposit !== 'number' ||
        unit.deposit < 0
      ) {
        logger.error('Invalid unit type at index', { index, unit });
        throw new Error(`Invalid or duplicate unit type: ${JSON.stringify(unit)}`);
      }
      unitTypeSet.add(unit.type);
      return {
        type: unit.type,
        quantity: unit.quantity,
        price: unit.price,
        deposit: unit.deposit,
      };
    });

    // Create new property
    const newProperty: PropertyListing = {
      _id: new ObjectId(),
      name,
      address,
      description: description?.trim() || undefined,
      facilities: validFacilities,
      unitTypes: validatedUnitTypes,
      status,
      ownerId: userId,
      isAdvertised,
      adExpiration: isAdvertised ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined,
      images: images,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<PropertyListing>('propertyListings').insertOne(newProperty);

    logger.debug('Property created', { propertyId: result.insertedId.toString(), userId });

    return NextResponse.json(
      {
        success: true,
        property: {
          ...newProperty,
          _id: result.insertedId.toString(),
          createdAt: newProperty.createdAt.toISOString(),
          updatedAt: newProperty.updatedAt.toISOString(),
          adExpiration: newProperty.adExpiration ? newProperty.adExpiration.toISOString() : undefined,
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
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log('Handling PUT request to /api/list-properties');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const userId = cookieStore.get('userId')?.value;

    if (!role || role !== 'propertyOwner' || !userId || !ObjectId.isValid(userId)) {
      logger.error('Unauthorized or invalid userId', { role, userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid user ID' },
        { status: 401 }
      );
    }

    // Extract CSRF token from headers
    const csrfToken = request.headers.get('X-CSRF-Token');
    if (!validateCsrfToken(request, csrfToken)) {
      logger.error('Invalid CSRF token', { userId, csrfToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { _id, name, address, description, facilities, unitTypes, status, isAdvertised, ownerId, images } = body;

    // Verify ownerId matches cookie
    if (ownerId !== userId) {
      logger.error('Mismatched ownerId', { ownerId, cookieUserId: userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Owner ID does not match session' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (
      !_id ||
      !ObjectId.isValid(_id) ||
      !name ||
      typeof name !== 'string' ||
      !address ||
      typeof address !== 'string' ||
      !unitTypes ||
      !Array.isArray(unitTypes) ||
      unitTypes.length === 0 ||
      !status ||
      !['Active', 'Inactive'].includes(status) ||
      typeof isAdvertised !== 'boolean'
    ) {
      logger.error('Missing or invalid required fields', { _id, name, address, unitTypes, status, isAdvertised });
      return NextResponse.json(
        { success: false, message: 'Missing or invalid required fields' },
        { status: 400 }
      );
    }

    // Validate description
    if (description && (typeof description !== 'string' || description.length > 500)) {
      logger.error('Invalid description', { description });
      return NextResponse.json(
        { success: false, message: 'Description must be a string with maximum 500 characters' },
        { status: 400 }
      );
    }

    // Validate facilities
    if (facilities && !Array.isArray(facilities)) {
      logger.error('Facilities must be an array', { facilities });
      return NextResponse.json(
        { success: false, message: 'Facilities must be an array' },
        { status: 400 }
      );
    }
    const validFacilities = facilities ? facilities.filter((f: string) => FACILITIES.includes(f)) : [];
    if (validFacilities.length > 10) {
      logger.error('Too many facilities', { facilitiesCount: validFacilities.length });
      return NextResponse.json(
        { success: false, message: 'Maximum 10 facilities allowed' },
        { status: 400 }
      );
    }

    // Validate images
    if (!images || !Array.isArray(images) || images.some((img: unknown) => typeof img !== 'string')) {
      logger.error('Invalid images array', { images });
      return NextResponse.json(
        { success: false, message: 'Images must be an array of strings' },
        { status: 400 }
      );
    }
    if (images.length > 9) {
      logger.error('Too many images', { imageCount: images.length });
      return NextResponse.json(
        { success: false, message: 'Maximum 9 images allowed' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB database: rentaldb');

    // Verify property exists and belongs to user
    const existingProperty = await db.collection<PropertyListing>('propertyListings').findOne({
      _id: new ObjectId(_id),
      ownerId: userId,
    });
    if (!existingProperty) {
      logger.error('Property not found or unauthorized', { _id, userId });
      return NextResponse.json(
        { success: false, message: 'Property not found or you are not authorized to edit it' },
        { status: 404 }
      );
    }

    // Validate unit types and check for duplicates
    const unitTypeSet = new Set<string>();
    const validatedUnitTypes: UnitType[] = unitTypes.map((unit: UnitType, index: number) => {
      if (
        !unit.type ||
        !UNIT_TYPES.some((ut) => ut.type === unit.type) ||
        unitTypeSet.has(unit.type) ||
        typeof unit.quantity !== 'number' ||
        unit.quantity < 0 ||
        typeof unit.price !== 'number' ||
        unit.price < 0 ||
        typeof unit.deposit !== 'number' ||
        unit.deposit < 0
      ) {
        logger.error('Invalid unit type at index', { index, unit });
        throw new Error(`Invalid or duplicate unit type: ${JSON.stringify(unit)}`);
      }
      unitTypeSet.add(unit.type);
      return {
        type: unit.type,
        quantity: unit.quantity,
        price: unit.price,
        deposit: unit.deposit,
      };
    });

    // Define updateData with required updatedAt
    const updateData: Partial<PropertyListing> & { updatedAt: Date } = {
      name,
      address,
      description: description?.trim() || undefined,
      facilities: validFacilities,
      unitTypes: validatedUnitTypes,
      status,
      isAdvertised,
      adExpiration: isAdvertised
        ? existingProperty.isAdvertised
          ? existingProperty.adExpiration
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : undefined,
      images,
      updatedAt: new Date(),
    };

    const result = await db.collection<PropertyListing>('propertyListings').updateOne(
      { _id: new ObjectId(_id), ownerId: userId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      logger.error('Property update failed: no matching document', { _id, userId });
      return NextResponse.json(
        { success: false, message: 'Property not found or you are not authorized to edit it' },
        { status: 404 }
      );
    }

    logger.debug('Property updated', { propertyId: _id, userId });

    return NextResponse.json(
      {
        success: true,
        property: {
          ...existingProperty,
          ...updateData,
          _id: _id,
          createdAt: existingProperty.createdAt.toISOString(),
          updatedAt: updateData.updatedAt.toISOString(), // Now safe because updatedAt is guaranteed
          adExpiration: updateData.adExpiration ? updateData.adExpiration.toISOString() : undefined,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('Error updating property', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('Handling DELETE request to /api/list-properties');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const userId = cookieStore.get('userId')?.value;

    if (!role || role !== 'propertyOwner' || !userId || !ObjectId.isValid(userId)) {
      logger.error('Unauthorized or invalid userId', { role, userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid user ID' },
        { status: 401 }
      );
    }

    // Extract CSRF token from headers
    const csrfToken = request.headers.get('X-CSRF-Token');
    if (!validateCsrfToken(request, csrfToken)) {
      logger.error('Invalid CSRF token', { userId, csrfToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      logger.error('Invalid or missing property ID', { id });
      return NextResponse.json(
        { success: false, message: 'Invalid or missing property ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB database: rentaldb');

    const result = await db.collection<PropertyListing>('propertyListings').deleteOne({
      _id: new ObjectId(id),
      ownerId: userId,
    });

    if (result.deletedCount === 0) {
      logger.error('Property not found or unauthorized', { id, userId });
      return NextResponse.json(
        { success: false, message: 'Property not found or you are not authorized to delete it' },
        { status: 404 }
      );
    }

    logger.debug('Property deleted', { propertyId: id, userId });

    return NextResponse.json(
      { success: true, message: 'Property deleted successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('Error deleting property', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
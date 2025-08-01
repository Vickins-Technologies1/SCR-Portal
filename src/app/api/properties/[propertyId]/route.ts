// src/app/api/properties/[propertyId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { validateCsrfToken } from '@/lib/csrf';
import { ObjectId } from 'mongodb';

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  managementType: 'RentCollection' | 'FullManagement';
  managementFee: number;
  quantity: number;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
  address?: string;
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

interface PropertyRequest {
  name?: string;
  address?: string;
  unitTypes?: UnitType[];
  requiresAdminApproval?: boolean;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { propertyId } = await params;
    const cookieStore = request.cookies;
    const role = cookieStore.get('role')?.value as 'admin' | 'tenant' | 'propertyOwner' | undefined;
    const userId = cookieStore.get('userId')?.value;
    console.log('GET /api/properties/[propertyId] - Cookies', { userId, role, propertyId });

    if (!role || !userId || !ObjectId.isValid(userId)) {
      console.log('Unauthorized', { userId, role });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Missing or invalid role or user ID' },
        { status: 401 }
      );
    }

    if (!ObjectId.isValid(propertyId)) {
      console.log('Invalid property ID', { propertyId });
      return NextResponse.json(
        { success: false, message: 'Invalid property ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const propertyObjectId = new ObjectId(propertyId);

    if (role === 'tenant') {
      const tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(userId),
        propertyId: propertyId,
      });

      if (!tenant) {
        console.log('Tenant not associated with property', { userId, propertyId });
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Tenant not associated with this property' },
          { status: 403 }
        );
      }
      console.log('Tenant authorized', { userId, propertyId });
    } else if (role !== 'admin' && role !== 'propertyOwner') {
      console.log('Unauthorized role', { userId, role, propertyId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Insufficient role permissions' },
        { status: 403 }
      );
    }

    const propertyQuery = role === 'tenant' ? { _id: propertyObjectId } : { _id: propertyObjectId, ownerId: userId };
    const property = await db.collection<Property>('properties').findOne(propertyQuery);

    if (!property) {
      console.log('Property lookup failed', { propertyId, userId });
      return NextResponse.json(
        { success: false, message: 'Property not found or not authorized' },
        { status: 404 }
      );
    }

    const tenants = await db
      .collection<Tenant>('tenants')
      .find({ propertyId: propertyId })
      .toArray();

    console.log('Property fetched successfully', { propertyId, userId, tenantCount: tenants.length });
    return NextResponse.json({
      success: true,
      property: {
        ...property,
        _id: property._id.toString(),
        ownerId: property.ownerId,
        createdAt: property.createdAt.toISOString(),
        updatedAt: property.updatedAt?.toISOString(),
      },
      tenants: tenants.map((tenant) => ({
        ...tenant,
        _id: tenant._id.toString(),
        propertyId: tenant.propertyId.toString(),
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt?.toISOString(),
        walletBalance: tenant.walletBalance ?? 0,
      })),
    });
  } catch (error: unknown) {
    console.error('Error in GET /api/properties/[propertyId]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const submittedToken = request.headers.get('X-CSRF-Token');
    console.log(`CSRF token extracted from header - Path: /api/properties/[propertyId], Token: ${submittedToken}`);
    const isValidCsrf = await validateCsrfToken(request, submittedToken);

    if (!isValidCsrf) {
      console.error('Invalid CSRF token', { submittedToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const { propertyId } = await params;
    const cookieStore = request.cookies;
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value as 'admin' | 'propertyOwner' | undefined;
    console.log('PUT /api/properties/[propertyId] - Cookies', { userId, role, propertyId });

    if (!userId || !ObjectId.isValid(userId) || !['propertyOwner', 'admin'].includes(role || '')) {
      console.log('Unauthorized', { userId, role });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Please log in as a property owner or admin' },
        { status: 401 }
      );
    }

    if (!ObjectId.isValid(propertyId)) {
      console.log('Invalid property ID', { propertyId });
      return NextResponse.json(
        { success: false, message: 'Invalid property ID' },
        { status: 400 }
      );
    }

    const requestData: Partial<PropertyRequest> = await request.json();
    console.log('PUT /api/properties/[propertyId] - Request body', { requestData });

    const { db } = await connectToDatabase();
    const propertyObjectId = new ObjectId(propertyId);

    const property = await db.collection<Property>('properties').findOne({
      _id: propertyObjectId,
      ownerId: userId,
    });

    if (!property) {
      console.log('Property lookup failed', { propertyId, userId });
      return NextResponse.json(
        { success: false, message: 'Property not found or not owned by user' },
        { status: 404 }
      );
    }

    const updatableFields: Array<keyof PropertyRequest> = ['name', 'address', 'unitTypes', 'requiresAdminApproval'];
    const updateData: Partial<Property> = {};

    for (const field of updatableFields) {
      if (requestData[field] !== undefined) {
        if (field === 'name' || field === 'address') {
          updateData[field] = requestData[field] as string;
        } else if (field === 'unitTypes') {
          updateData[field] = requestData[field] as UnitType[];
        } else if (field === 'requiresAdminApproval') {
          updateData[field] = requestData[field] as boolean;
        }
      }
    }

    if (updateData.unitTypes) {
      for (const unit of updateData.unitTypes) {
        if (
          !unit.type ||
          typeof unit.price !== 'number' ||
          typeof unit.deposit !== 'number' ||
          !['RentCollection', 'FullManagement'].includes(unit.managementType) ||
          typeof unit.managementFee !== 'number' ||
          typeof unit.quantity !== 'number'
        ) {
          console.log('Invalid unit type data', { unit });
          return NextResponse.json(
            { success: false, message: 'Invalid unit type data' },
            { status: 400 }
          );
        }
      }

      const tenants = await db.collection<Tenant>('tenants').find({ propertyId: propertyId }).toArray();
      const newUnitTypes = new Set(updateData.unitTypes.map((u) => u.type));

      for (const tenant of tenants) {
        if (!newUnitTypes.has(tenant.unitType)) {
          console.log('Cannot remove unit type with active tenants', { unitType: tenant.unitType });
          return NextResponse.json(
            { success: false, message: `Cannot remove unit type '${tenant.unitType}' with active tenants` },
            { status: 400 }
          );
        }

        const newUnit = updateData.unitTypes.find((u) => u.type === tenant.unitType);
        if (newUnit && (newUnit.price !== tenant.price || newUnit.deposit !== tenant.deposit)) {
          console.log('Unit type price/deposit mismatch with tenant', { unitType: tenant.unitType });
          return NextResponse.json(
            {
              success: false,
              message: `Unit type '${tenant.unitType}' price or deposit cannot be changed while tenants are assigned`,
            },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      console.log('No fields provided for update');
      return NextResponse.json(
        { success: false, message: 'No fields provided for update' },
        { status: 400 }
      );
    }

    updateData.updatedAt = new Date();
    const result = await db.collection<Property>('properties').findOneAndUpdate(
      { _id: propertyObjectId, ownerId: userId },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!result) {
      console.log('Failed to update property', { propertyId });
      return NextResponse.json(
        { success: false, message: 'Failed to update property' },
        { status: 404 }
      );
    }

    console.log('Property updated', { propertyId, updatedFields: Object.keys(updateData) });
    return NextResponse.json({
      success: true,
      message: 'Property updated successfully',
      property: {
        ...result,
        _id: result._id.toString(),
        ownerId: result.ownerId,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt?.toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error('Error in PUT /api/properties/[propertyId]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const submittedToken = request.headers.get('X-CSRF-Token');
    console.log(`CSRF token extracted from header - Path: /api/properties/[propertyId], Token: ${submittedToken}`);
    const isValidCsrf = await validateCsrfToken(request, submittedToken);

    if (!isValidCsrf) {
      console.error('Invalid CSRF token', { submittedToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const { propertyId } = await params;
    const cookieStore = request.cookies;
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value as 'admin' | 'propertyOwner' | undefined;
    console.log('DELETE /api/properties/[propertyId] - Cookies', { userId, role, propertyId });

    if (!userId || !ObjectId.isValid(userId) || !['propertyOwner', 'admin'].includes(role || '')) {
      console.log('Unauthorized', { userId, role });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Please log in as a property owner or admin' },
        { status: 401 }
      );
    }

    if (!ObjectId.isValid(propertyId)) {
      console.log('Invalid property ID', { propertyId });
      return NextResponse.json(
        { success: false, message: 'Invalid property ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const propertyObjectId = new ObjectId(propertyId);

    const property = await db.collection<Property>('properties').findOne({
      _id: propertyObjectId,
      ownerId: userId,
    });

    if (!property) {
      console.log('Property lookup failed', { propertyId, userId });
      return NextResponse.json(
        { success: false, message: 'Property not found or not owned by user' },
        { status: 404 }
      );
    }

    const tenantCount = await db.collection<Tenant>('tenants').countDocuments({ propertyId: propertyId });
    if (tenantCount > 0) {
      console.log('Cannot delete property with active tenants', { propertyId, tenantCount });
      return NextResponse.json(
        { success: false, message: 'Cannot delete property with active tenants' },
        { status: 400 }
      );
    }

    const deleteResult = await db.collection<Property>('properties').deleteOne({
      _id: propertyObjectId,
      ownerId: userId,
    });

    if (deleteResult.deletedCount === 0) {
      console.log('Failed to delete property', { propertyId });
      return NextResponse.json(
        { success: false, message: 'Failed to delete property' },
        { status: 404 }
      );
    }

    console.log('Property deleted successfully', { propertyId });
    return NextResponse.json({
      success: true,
      message: 'Property deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error in DELETE /api/properties/[propertyId]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
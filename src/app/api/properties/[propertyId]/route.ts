import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { validateCsrfToken } from '@/lib/csrf';
import { ObjectId } from 'mongodb';

// ===============================================
// INTERFACES
// ===============================================
export interface UnitType {
  type: string;
  uniqueType?: string;
  price: number;
  deposit: number;
  managementType: 'RentCollection' | 'FullManagement';
  quantity: number;
  managementFee?: number;
}

export interface Property {
  _id: ObjectId | string;
  ownerId: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  managementFee?: number;
  status: string;
  rentPaymentDate?: number;
  createdAt: Date | string;
  updatedAt?: Date | string;
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
  createdAt: Date | string;
  updatedAt?: Date | string;
  walletBalance: number;
  status?: string;
}

interface PropertyRequest {
  name?: string;
  address?: string;
  unitTypes?: UnitType[];
}

// ===============================================
// HELPER: Safe ISO String Conversion
// ===============================================
const toISO = (date: Date | string | undefined): string | undefined => {
  if (!date) return undefined;
  const d = new Date(date);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

// ===============================================
// HELPER: Tenant Status
// ===============================================
const getTenantStatus = (leaseStartDate: string, leaseEndDate: string): string => {
  const now = new Date();
  const start = leaseStartDate ? new Date(leaseStartDate) : null;
  const end = leaseEndDate ? new Date(leaseEndDate) : null;

  if (!start || !end) return 'Unknown';
  if (now < start) return 'Pending';
  if (now >= start && now <= end) return 'Active';
  return 'Expired';
};

// ===============================================
// GET: Fetch Property + Tenants
// ===============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const { propertyId } = await params;
    const cookies = request.cookies;
    const role = cookies.get('role')?.value as 'admin' | 'tenant' | 'propertyOwner' | undefined;
    const userId = cookies.get('userId')?.value;

    if (!role || !userId || !ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Missing or invalid role or user ID' },
        { status: 401 }
      );
    }

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid property ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const propId = new ObjectId(propertyId);

    if (role === 'tenant') {
      const tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(userId),
        propertyId,
      });
      if (!tenant) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Tenant not associated with this property' },
          { status: 403 }
        );
      }
    } else if (role !== 'admin' && role !== 'propertyOwner') {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Insufficient role permissions' },
        { status: 403 }
      );
    }

    const query = role === 'tenant' ? { _id: propId } : { _id: propId, ownerId: userId };
    const property = await db.collection<Property>('properties').findOne(query);

    if (!property) {
      return NextResponse.json(
        { success: false, message: 'Property not found or not authorized' },
        { status: 404 }
      );
    }

    const tenants = await db.collection<Tenant>('tenants').find({ propertyId }).toArray();

    return NextResponse.json({
      success: true,
      property: {
        ...property,
        _id: property._id.toString(),
        ownerId: property.ownerId,
        createdAt: toISO(property.createdAt),
        updatedAt: toISO(property.updatedAt),
      },
      tenants: tenants.map(t => ({
        ...t,
        _id: t._id.toString(),
        propertyId: t.propertyId.toString(),
        ownerId: t.ownerId,
        createdAt: toISO(t.createdAt),
        updatedAt: toISO(t.updatedAt),
        walletBalance: t.walletBalance ?? 0,
        status: getTenantStatus(t.leaseStartDate, t.leaseEndDate),
      })),
    });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===============================================
// PUT: Update Property
// ===============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const csrfHeader = request.headers.get('X-CSRF-Token');
    const isValidCsrf = validateCsrfToken(request, csrfHeader);

    if (!isValidCsrf) {
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const { propertyId } = await params;
    const cookies = request.cookies;
    const userId = cookies.get('userId')?.value;
    const role = cookies.get('role')?.value as 'admin' | 'propertyOwner' | undefined;

    if (!userId || !ObjectId.isValid(userId) || !['propertyOwner', 'admin'].includes(role ?? '')) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Please log in as a property owner or admin' },
        { status: 401 }
      );
    }

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid property ID' },
        { status: 400 }
      );
    }

    const payload: Partial<PropertyRequest> = await request.json();
    const { db } = await connectToDatabase();
    const propId = new ObjectId(propertyId);

    const existing = await db.collection<Property>('properties').findOne({
      _id: propId,
      ownerId: userId,
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Property not found or not owned by user' },
        { status: 404 }
      );
    }

    const allowed: Array<keyof PropertyRequest> = ['name', 'address', 'unitTypes'];
    const update: Partial<Property> = {};

    for (const field of allowed) {
      if (payload[field] !== undefined) {
        if (field === 'name' || field === 'address') {
          update[field] = payload[field] as string;
        } else if (field === 'unitTypes') {
          update[field] = payload[field] as UnitType[];
        }
      }
    }

    // === UNIT TYPE VALIDATION ===
    if (update.unitTypes) {
      const validated: UnitType[] = [];
      const currentTypes = new Set(existing.unitTypes.map(u => u.type));
      const newTypes = new Set(update.unitTypes.map(u => u.type));

      for (const u of update.unitTypes) {
        if (
          !u.type ||
          typeof u.price !== 'number' || u.price < 0 ||
          typeof u.deposit !== 'number' || u.deposit < 0 ||
          typeof u.quantity !== 'number' || u.quantity < 0 ||
          !['RentCollection', 'FullManagement'].includes(u.managementType)
        ) {
          return NextResponse.json(
            { success: false, message: `Invalid unit type '${u.type ?? 'unknown'}: missing or invalid fields` },
            { status: 400 }
          );
        }

        if (u.managementType === 'FullManagement') {
          if (typeof u.managementFee !== 'number' || u.managementFee < 0) {
            return NextResponse.json(
              { success: false, message: `managementFee is required and must be >= 0 for FullManagement unit '${u.type}'` },
              { status: 400 }
            );
          }
        } else if (u.managementFee !== undefined && typeof u.managementFee !== 'number') {
          return NextResponse.json(
            { success: false, message: `managementFee must be a number for RentCollection unit '${u.type}'` },
            { status: 400 }
          );
        }

        validated.push({
          ...u,
          managementFee: u.managementType === 'RentCollection' && u.managementFee === undefined ? 0 : u.managementFee,
        });
      }

      update.unitTypes = validated;

      // === TENANT CONFLICT CHECK ===
      const tenants = await db.collection<Tenant>('tenants').find({ propertyId }).toArray();

      const removedTypes = [...currentTypes].filter(t => !newTypes.has(t));
      if (removedTypes.length > 0) {
        const tenantsInRemoved = tenants.filter(t => removedTypes.includes(t.unitType));
        if (tenantsInRemoved.length > 0) {
          const typeList = removedTypes.join(', ');
          return NextResponse.json(
            { success: false, message: `Cannot remove unit type(s): ${typeList} – active tenants exist` },
            { status: 400 }
          );
        }
      }

      for (const t of tenants) {
        const newUnit = validated.find(v => v.type === t.unitType);
        if (newUnit && (newUnit.price !== t.price || newUnit.deposit !== t.deposit)) {
          return NextResponse.json(
            { success: false, message: `Cannot change price or deposit for unit type '${t.unitType}' – tenants are assigned` },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No fields provided for update' },
        { status: 400 }
      );
    }

    update.updatedAt = new Date();

    const result = await db.collection<Property>('properties').findOneAndUpdate(
      { _id: propId, ownerId: userId },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json(
        { success: false, message: 'Failed to update property' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Property updated successfully',
      property: {
        ...result,
        _id: result._id.toString(),
        ownerId: result.ownerId,
        createdAt: toISO(result.createdAt),
        updatedAt: toISO(result.updatedAt),
      },
    });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===============================================
// DELETE: Remove Property + Data
// ===============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const csrfHeader = request.headers.get('X-CSRF-Token');
    const isValidCsrf = validateCsrfToken(request, csrfHeader);

    if (!isValidCsrf) {
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const { propertyId } = await params;
    const cookies = request.cookies;
    const userId = cookies.get('userId')?.value;
    const role = cookies.get('role')?.value as 'admin' | 'propertyOwner' | undefined;

    if (!userId || !ObjectId.isValid(userId) || !['propertyOwner', 'admin'].includes(role ?? '')) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Please log in as a property owner or admin' },
        { status: 401 }
      );
    }

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid property ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const propId = new ObjectId(propertyId);

    const query = role === 'admin' ? { _id: propId } : { _id: propId, ownerId: userId };
    const property = await db.collection<Property>('properties').findOne(query);

    if (!property) {
      return NextResponse.json(
        { success: false, message: 'Property not found or not owned by user' },
        { status: 404 }
      );
    }

    const [invDel, tenDel] = await Promise.all([
      db.collection('invoices').deleteMany({ propertyId }),
      db.collection<Tenant>('tenants').deleteMany({ propertyId }),
    ]);

    const delRes = await db.collection<Property>('properties').deleteOne({ _id: propId });

    if (delRes.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: 'Failed to delete property' },
        { status: 404 }
      );
    }

    console.log('Property deleted', {
      propertyId,
      tenantsDeleted: tenDel.deletedCount,
      invoicesDeleted: invDel.deletedCount,
    });

    return NextResponse.json({
      success: true,
      message: 'Property, tenants, and invoices deleted successfully',
    });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
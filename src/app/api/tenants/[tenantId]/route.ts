import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../lib/mongodb';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { sendUpdateEmail } from '../../../../lib/email';
import { ObjectId } from 'mongodb';
import { Tenant, TenantRequest, ResponseTenant } from '../../../../types/tenant';
import { Property } from '../../../../types/property';
import { UNIT_TYPES, getManagementFee } from '../../../../lib/unitTypes';

interface ApiResponse {
  success: boolean;
  message?: string;
  tenant?: ResponseTenant;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone);
}

export async function GET(request: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    console.log('GET /api/tenants/[tenantId] - Tenant ID:', tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log('Invalid tenant ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Invalid tenant ID' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;
    console.log('Cookies - userId:', userId, 'role:', role);

    if (!userId || (role !== 'tenant' && role !== 'propertyOwner' && role !== 'admin')) {
      console.log('Unauthorized - userId:', userId, 'role:', role);
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    let tenant;

    if (role === 'admin') {
      tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(tenantId),
      });
    } else if (role === 'tenant' && userId === tenantId) {
      tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(tenantId),
      });
    } else if (role === 'propertyOwner') {
      tenant = await db.collection<Tenant>('tenants').findOne({
        _id: new ObjectId(tenantId),
        ownerId: userId,
      });
    }

    if (!tenant) {
      console.log('Tenant not found or not authorized for ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Tenant not found or not authorized' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        tenant: {
          ...tenant,
          _id: tenant._id.toString(),
          propertyId: tenant.propertyId.toString(),
          leaseStartDate: tenant.leaseStartDate || '',
          leaseEndDate: tenant.leaseEndDate || '',
          walletBalance: tenant.walletBalance || 0,
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt?.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in GET /api/tenants/[tenantId]:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    console.log('PUT /api/tenants/[tenantId] - Tenant ID:', tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log('Invalid tenant ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Invalid tenant ID' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;
    console.log('Cookies - userId:', userId, 'role:', role);

    if (!userId || role !== 'propertyOwner') {
      console.log('Unauthorized - userId:', userId, 'role:', role);
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body: TenantRequest = await req.json();
    const { db } = await connectToDatabase();

    if (
      !body.name ||
      !body.email ||
      !body.phone ||
      !body.propertyId ||
      !body.houseNumber ||
      !body.unitType ||
      !body.leaseStartDate ||
      !body.leaseEndDate ||
      body.price === undefined ||
      body.deposit === undefined
    ) {
      console.log('Missing required fields:', body);
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (!ObjectId.isValid(body.propertyId)) {
      console.log('Invalid property ID:', body.propertyId);
      return NextResponse.json({ success: false, message: 'Invalid property ID' }, { status: 400 });
    }

    if (!isValidEmail(body.email)) {
      console.log('Invalid email format:', body.email);
      return NextResponse.json({ success: false, message: 'Invalid email format' }, { status: 400 });
    }

    if (!isValidPhone(body.phone)) {
      console.log('Invalid phone format:', body.phone);
      return NextResponse.json({ success: false, message: 'Invalid phone format' }, { status: 400 });
    }

    if (new Date(body.leaseEndDate) <= new Date(body.leaseStartDate)) {
      console.log('Invalid lease dates:', body.leaseStartDate, body.leaseEndDate);
      return NextResponse.json({ success: false, message: 'Lease end date must be after start date' }, { status: 400 });
    }

    if (body.walletBalance !== undefined && (typeof body.walletBalance !== 'number' || body.walletBalance < 0)) {
      console.log('Invalid wallet balance:', body.walletBalance);
      return NextResponse.json({ success: false, message: 'Wallet balance must be a non-negative number' }, { status: 400 });
    }

    const existingTenant = await db.collection<Tenant>('tenants').findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!existingTenant) {
      console.log('Tenant not found for ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Tenant not found or not authorized' }, { status: 404 });
    }

    const emailExists = await db.collection<Tenant>('tenants').findOne({
      email: body.email,
      _id: { $ne: new ObjectId(tenantId) },
    });
    if (emailExists) {
      console.log('Email already exists:', body.email);
      return NextResponse.json({ success: false, message: 'Email already exists' }, { status: 400 });
    }

    const property = await db.collection<Property>('properties').findOne({
      _id: new ObjectId(body.propertyId),
      ownerId: userId,
    });
    if (!property) {
      console.log('Invalid property ID:', body.propertyId);
      return NextResponse.json({ success: false, message: 'Invalid property' }, { status: 400 });
    }

    const unit = property.unitTypes.find((u) => u.type === body.unitType);
    if (!unit || unit.price !== body.price || unit.deposit !== body.deposit) {
      console.log('Invalid unit or price/deposit mismatch:', body.unitType);
      return NextResponse.json({ success: false, message: 'Invalid unit or price/deposit mismatch' }, { status: 400 });
    }

    let managementFee: number | string | undefined;
    if (
      existingTenant.unitType !== body.unitType ||
      existingTenant.propertyId.toString() !== body.propertyId
    ) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user || user.paymentStatus !== 'active' || user.walletBalance < 1000) {
        console.log('Invalid payment status or insufficient wallet balance:', {
          paymentStatus: user?.paymentStatus,
          walletBalance: user?.walletBalance,
        });
        return NextResponse.json(
          { success: false, message: 'Active payment status and minimum wallet balance of Ksh 1,000 required' },
          { status: 402 }
        );
      }

      managementFee = getManagementFee({ type: body.unitType, managementType: unit.managementType, quantity: unit.quantity });
      if (managementFee === "Call for pricing") {
        console.log('Cannot update tenant due to undefined management fee:', body.unitType);
        return NextResponse.json(
          { success: false, message: 'Cannot update tenant: Management fee requires pricing confirmation. Please contact support.' },
          { status: 400 }
        );
      }
      if (typeof managementFee === "number" && user.walletBalance < managementFee) {
        console.log('Insufficient wallet balance for management fee:', { walletBalance: user.walletBalance, managementFee });
        return NextResponse.json(
          { success: false, message: `Insufficient wallet balance. Required: Ksh ${managementFee}` },
          { status: 402 }
        );
      }
    }

    const updateData: Partial<Tenant> = {
      name: body.name,
      email: body.email,
      phone: body.phone,
      propertyId: new ObjectId(body.propertyId),
      houseNumber: body.houseNumber,
      unitType: body.unitType,
      price: body.price,
      deposit: body.deposit,
      leaseStartDate: body.leaseStartDate,
      leaseEndDate: body.leaseEndDate,
      status: body.status ?? existingTenant.status,
      paymentStatus: body.paymentStatus ?? existingTenant.paymentStatus,
      ownerId: userId,
      createdAt: existingTenant.createdAt,
      updatedAt: new Date(),
      walletBalance: body.walletBalance !== undefined ? body.walletBalance : existingTenant.walletBalance,
    };

    if (body.password) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    if (managementFee && typeof managementFee === "number") {
      await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $inc: { walletBalance: -managementFee } }
      );
      await db.collection('walletTransactions').insertOne({
        userId,
        type: 'debit',
        amount: managementFee,
        createdAt: new Date().toISOString(),
        description: `Tenant update fee for ${body.unitType} in property ${property.name}`,
      });
    }

    if (body.walletBalance !== undefined && body.walletBalance !== existingTenant.walletBalance) {
      console.log(`Wallet balance updated for tenant ${tenantId}: ${existingTenant.walletBalance} -> ${body.walletBalance}`);
      await db.collection('walletTransactions').insertOne({
        tenantId,
        type: body.walletBalance > existingTenant.walletBalance ? 'credit' : 'debit',
        amount: Math.abs(body.walletBalance - existingTenant.walletBalance),
        createdAt: new Date().toISOString(),
        description: 'Wallet balance updated via tenant update',
      });
    }

    const result = await db.collection<Tenant>('tenants').updateOne(
      { _id: new ObjectId(tenantId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      console.log('No tenant matched for update:', tenantId);
      return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    }

    await sendUpdateEmail({
      to: body.email,
      name: body.name,
      email: body.email,
      propertyName: property.name,
      houseNumber: body.houseNumber,
    });

    return NextResponse.json(
      {
        success: true,
        tenant: {
          ...updateData,
          _id: tenantId,
          propertyId: body.propertyId,
          createdAt: (updateData.createdAt as Date).toISOString(), // Assert createdAt is defined
          updatedAt: (updateData.updatedAt as Date).toISOString(), // Assert updatedAt is defined
          walletBalance: updateData.walletBalance || 0,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/tenants/[tenantId]:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    console.log('DELETE /api/tenants/[tenantId] - Tenant ID:', tenantId);

    if (!ObjectId.isValid(tenantId)) {
      console.log('Invalid tenant ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Invalid tenant ID' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;
    console.log('Cookies - userId:', userId, 'role:', role);

    if (!userId || role !== 'propertyOwner') {
      console.log('Unauthorized - userId:', userId, 'role:', role);
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    const tenant = await db.collection<Tenant>('tenants').findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (!tenant) {
      console.log('Tenant not found or not authorized for ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Tenant not found or not authorized' }, { status: 404 });
    }

    const result = await db.collection<Tenant>('tenants').deleteOne({
      _id: new ObjectId(tenantId),
      ownerId: userId,
    });

    if (result.deletedCount === 0) {
      console.log('No tenant deleted for ID:', tenantId);
      return NextResponse.json({ success: false, message: 'Tenant not found or not authorized' }, { status: 404 });
    }

    const walletDeleteResult = await db.collection('walletTransactions').deleteMany({
      tenantId,
    });
    console.log(`Deleted ${walletDeleteResult.deletedCount} wallet transactions for tenant ${tenantId}`);

    return NextResponse.json(
      { success: true, message: 'Tenant and related wallet transactions deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in DELETE /api/tenants/[tenantId]:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
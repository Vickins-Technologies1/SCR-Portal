// src/app/api/tenants/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { sendWelcomeEmail } from '../../../lib/email';
import { ObjectId } from 'mongodb';
import { Tenant, TenantRequest, ResponseTenant } from '../../../types/tenant';
import { Property } from '../../../types/property';
import { getManagementFee } from '../../../lib/unitTypes';

interface ApiResponse {
  success: boolean;
  message?: string;
  tenants?: ResponseTenant[];
  tenant?: ResponseTenant;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone);
}

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;

    const { db } = await connectToDatabase();

    if (role === 'admin') {
      const tenants = await db.collection<Tenant>('tenants').find().toArray();
      return NextResponse.json({
        success: true,
        tenants: tenants.map((tenant) => ({
          ...tenant,
          _id: tenant._id.toString(),
          propertyId: tenant.propertyId.toString(),
          leaseStartDate: tenant.leaseStartDate || '',
          leaseEndDate: tenant.leaseEndDate || '',
          walletBalance: tenant.walletBalance || 0,
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt?.toISOString(),
        })),
      }, { status: 200 });
    }

    if (!userId || !ObjectId.isValid(userId) || role !== 'propertyOwner') {
      console.log('Unauthorized - userId:', userId, 'role:', role);
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const tenants = await db.collection<Tenant>('tenants').find({ ownerId: userId }).toArray();

    return NextResponse.json({
      success: true,
      tenants: tenants.map((tenant) => ({
        ...tenant,
        _id: tenant._id.toString(),
        propertyId: tenant.propertyId.toString(),
        leaseStartDate: tenant.leaseStartDate || '',
        leaseEndDate: tenant.leaseEndDate || '',
        walletBalance: tenant.walletBalance || 0,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt?.toISOString(),
      })),
    }, { status: 200 });
  } catch (error) {
    console.error('Error in GET /api/tenants:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;

    if (!userId || role !== 'propertyOwner') {
      console.log('Unauthorized - userId:', userId, 'role:', role);
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body: TenantRequest = await req.json();
    const {
      name,
      email,
      phone,
      password,
      role: tenantRole,
      propertyId,
      unitType,
      price,
      deposit,
      houseNumber,
      leaseStartDate,
      leaseEndDate,
    } = body;

    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      !tenantRole ||
      !propertyId ||
      !unitType ||
      !houseNumber ||
      !leaseStartDate ||
      !leaseEndDate ||
      price === undefined ||
      deposit === undefined
    ) {
      console.log('Missing required fields:', body);
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (tenantRole !== 'tenant') {
      console.log('Invalid role:', tenantRole);
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      console.log('Invalid email format:', email);
      return NextResponse.json({ success: false, message: 'Invalid email format' }, { status: 400 });
    }

    if (!isValidPhone(phone)) {
      console.log('Invalid phone format:', phone);
      return NextResponse.json({ success: false, message: 'Invalid phone format' }, { status: 400 });
    }

    if (!ObjectId.isValid(propertyId)) {
      console.log('Invalid property ID:', propertyId);
      return NextResponse.json({ success: false, message: 'Invalid property ID' }, { status: 400 });
    }

    if (new Date(leaseEndDate) <= new Date(leaseStartDate)) {
      console.log('Invalid lease dates:', leaseStartDate, leaseEndDate);
      return NextResponse.json({ success: false, message: 'Lease end date must be after start date' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user || user.paymentStatus !== 'active' || user.walletBalance < 1000) {
      console.log('Invalid payment status or insufficient wallet balance:', { paymentStatus: user?.paymentStatus, walletBalance: user?.walletBalance });
      return NextResponse.json({ success: false, message: 'Active payment status and minimum wallet balance of Ksh 1,000 required' }, { status: 402 });
    }

    const existing = await db.collection('tenants').findOne({ email });
    if (existing) {
      console.log('Email already exists:', email);
      return NextResponse.json({ success: false, message: 'Email already exists' }, { status: 400 });
    }

    const property = await db.collection<Property>('properties').findOne({
      _id: new ObjectId(propertyId),
      ownerId: userId,
    });
    if (!property) {
      console.log('Invalid property ID:', propertyId);
      return NextResponse.json({ success: false, message: 'Invalid property' }, { status: 400 });
    }

    const unit = property.unitTypes.find((u) => u.type === unitType);
    if (!unit || unit.price !== price || unit.deposit !== deposit) {
      console.log('Invalid unit or price/deposit mismatch:', unitType);
      return NextResponse.json({ success: false, message: 'Invalid unit or price/deposit mismatch' }, { status: 400 });
    }

    const managementFee = getManagementFee({ type: unitType, managementType: unit.managementType, quantity: unit.quantity });
    if (managementFee === "Call for pricing") {
      console.log('Cannot add tenant due to undefined management fee:', unitType);
      return NextResponse.json({ success: false, message: 'Cannot add tenant: Management fee requires pricing confirmation. Please contact support.' }, { status: 400 });
    }
    if (typeof managementFee === "number" && user.walletBalance < managementFee) {
      console.log('Insufficient wallet balance for management fee:', { walletBalance: user.walletBalance, managementFee });
      return NextResponse.json({ success: false, message: `Insufficient wallet balance. Required: Ksh ${managementFee}` }, { status: 402 });
    }

    const existingHouseNumber = await db.collection('tenants').findOne({
      propertyId: new ObjectId(propertyId),
      houseNumber,
    });
    if (existingHouseNumber) {
      console.log('House number already in use:', houseNumber);
      return NextResponse.json({ success: false, message: 'House number already in use for this property' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const tenant: Tenant = {
      _id: new ObjectId(),
      name,
      email,
      phone,
      password: hashedPassword,
      role: 'tenant',
      ownerId: userId,
      propertyId: new ObjectId(propertyId),
      unitType,
      price: parseFloat(price.toString()),
      deposit: parseFloat(deposit.toString()),
      houseNumber,
      leaseStartDate,
      leaseEndDate,
      status: 'active',
      paymentStatus: 'current',
      createdAt: new Date(),
      walletBalance: 0,
    };

    if (typeof managementFee === "number") {
      await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $inc: { walletBalance: -managementFee } }
      );
      await db.collection('walletTransactions').insertOne({
        userId,
        type: 'debit',
        amount: managementFee,
        createdAt: new Date().toISOString(),
        description: `Tenant addition fee for ${unitType} in property ${property.name}`,
      });
    }

    const result = await db.collection('tenants').insertOne(tenant);

    const loginUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    await sendWelcomeEmail({
      to: email,
      name,
      email,
      password,
      loginUrl,
      propertyName: property.name,
      houseNumber,
    });

    return NextResponse.json(
      {
        success: true,
        tenant: {
          ...tenant,
          _id: result.insertedId.toString(),
          propertyId,
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/tenants:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Property } from '@/types/property';
import { Tenant } from '@/types/tenant';

// Utility to parse cookies manually
function parseCookies(req: NextRequest) {
  const cookie = req.headers.get('cookie') || '';
  const cookieObj: Record<string, string> = {};
  cookie.split(';').forEach((c) => {
    const [key, value] = c.trim().split('=');
    if (key && value) cookieObj[key] = decodeURIComponent(value);
  });
  return cookieObj;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(request: NextRequest, context: any) {
  try {
    const { propertyId } = context.params as { propertyId: string };

    if (!ObjectId.isValid(propertyId)) {
      return NextResponse.json({ success: false, message: 'Invalid property ID' }, { status: 400 });
    }

    const cookies = parseCookies(request);
    const role = cookies['role'];

    if (role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const property = await db.collection<Property>('properties').findOne({ _id: new ObjectId(propertyId) });

    if (!property) {
      return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
    }

    const tenants = await db
      .collection<Tenant>('tenants')
      .find({ propertyId: new ObjectId(propertyId) })
      .toArray();

    return NextResponse.json({
      success: true,
      property: {
        ...property,
        _id: property._id.toString(),
        ownerId: property.ownerId,
        createdAt: property.createdAt.toISOString(),
        updatedAt: property.updatedAt.toISOString(),
      },
      tenants: tenants.map((tenant) => ({
        ...tenant,
        _id: tenant._id.toString(),
        propertyId: tenant.propertyId.toString(),
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt?.toISOString(),
        walletBalance: tenant.walletBalance || 0,
      })),
    });
  } catch (error) {
    console.error('GET /api/properties/[propertyId] error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
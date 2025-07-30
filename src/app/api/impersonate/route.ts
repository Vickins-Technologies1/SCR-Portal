// lint-disable-next-line no-unused-vars
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId, Db } from 'mongodb';

// Cached MongoDB client to avoid creating new connections per request
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

const connectToDatabase = async (): Promise<Db> => {
  if (cachedDb) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
  try {
    await client.connect();
    cachedClient = client;
    cachedDb = client.db('rentaldb');
    console.log('Established new MongoDB connection');
    return cachedDb;
  } catch (error) {
    console.error('Failed to connect to MongoDB', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

export async function POST(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  let tenantId: string | undefined;
  let userId: string | undefined;

  try {
    // Await params (for consistency with Next.js 14+ dynamic routes)
    await params;

    // Parse request body
    const body = await request.json();
    tenantId = body.tenantId;
    userId = body.userId;
    const csrfToken = body.csrfToken;

    // Validate CSRF token
    const storedCsrfToken = request.cookies.get('csrf-token')?.value;
    if (!csrfToken || csrfToken !== storedCsrfToken) {
      console.log('CSRF token validation failed', {
        path: '/api/impersonate',
        submittedToken: csrfToken || 'undefined',
        storedToken: storedCsrfToken || 'undefined',
      });
      return NextResponse.json(
        { success: false, message: 'CSRF token validation failed' },
        { status: 403 }
      );
    }

    // Validate tenantId and userId
    if (!tenantId || !userId || !ObjectId.isValid(tenantId) || !ObjectId.isValid(userId)) {
      console.log('Invalid input', {
        tenantId: tenantId || 'undefined',
        userId: userId || 'undefined',
        tenantIdValid: tenantId ? ObjectId.isValid(tenantId) : false,
        userIdValid: userId ? ObjectId.isValid(userId) : false,
      });
      return NextResponse.json(
        { success: false, message: 'Invalid tenant ID or user ID' },
        { status: 400 }
      );
    }

    // Get cookies
    const cookies = request.cookies;
    const currentUserId = cookies.get('userId')?.value;
    const role = cookies.get('role')?.value as 'admin' | 'propertyOwner' | 'tenant' | undefined;

    // Check authorization
    if (!currentUserId || role !== 'propertyOwner') {
      console.log('Unauthorized access attempt', {
        currentUserId: currentUserId || 'undefined',
        role: role || 'undefined',
      });
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Must be a property owner' },
        { status: 401 }
      );
    }

    // Verify userId matches currentUserId
    if (currentUserId !== userId) {
      console.log('User ID mismatch', { currentUserId, userId });
      return NextResponse.json(
        { success: false, message: 'User ID mismatch' },
        { status: 403 }
      );
    }

    // Connect to database
    const db = await connectToDatabase();

    // Verify tenant exists and is associated with the property owner
    const tenant = await db.collection('tenants').findOne({
      _id: new ObjectId(tenantId),
      ownerId: userId, // ownerId is a string in the schema
    });

    if (!tenant) {
      console.log('Tenant lookup failed', {
        tenantId,
        userId,
        query: { _id: tenantId, ownerId: userId },
      });
      return NextResponse.json(
        { success: false, message: 'Tenant not found or not authorized for this property owner' },
        { status: 404 }
      );
    }

    // Verify property association
    if (!tenant.propertyId || !ObjectId.isValid(tenant.propertyId)) {
      console.log('Invalid or missing tenant propertyId', {
        tenantId,
        propertyId: tenant.propertyId || 'undefined',
      });
      return NextResponse.json(
        { success: false, message: 'Tenant has no valid property association' },
        { status: 400 }
      );
    }

    const property = await db.collection('properties').findOne({
      _id: new ObjectId(tenant.propertyId),
      ownerId: userId, // ownerId is a string in the schema
    });

    if (!property) {
      console.log('Property not found or not authorized for tenant', {
        tenantId,
        propertyId: tenant.propertyId,
        ownerId: userId,
      });
      return NextResponse.json(
        { success: false, message: 'Property not found or not authorized for this property owner' },
        { status: 404 }
      );
    }

    // Log successful impersonation
    console.log('Impersonation successful', {
      propertyOwner: userId,
      tenantId,
      propertyId: tenant.propertyId,
    });

    // Create response and set cookies for impersonation
    const response = NextResponse.json({ success: true });
    response.cookies.set('userId', tenantId, {
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.cookies.set('role', 'tenant', {
      path: '/',
      maxAge: 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.cookies.set('originalUserId', currentUserId, {
      path: '/',
      maxAge: 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.cookies.set('originalRole', 'propertyOwner', {
      path: '/',
      maxAge: 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return response;
  } catch (error) {
    console.error('Error in POST /api/impersonate', {
      tenantId: tenantId || 'undefined',
      userId: userId || 'undefined',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
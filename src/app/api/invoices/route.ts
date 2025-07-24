import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('Handling GET request to /api/invoices');

    // Read cookies from client request
    const userId = request.cookies.get('userId')?.value;
    const role = request.cookies.get('role')?.value;

    console.log('Cookies from request:', { userId, role });

    // Validate userId
    if (!userId || !ObjectId.isValid(userId)) {
      console.log('Invalid or missing user ID:', userId);
      return NextResponse.json(
        { success: false, message: 'Valid user ID is required' },
        { status: 400 }
      );
    }

    // Allow both propertyOwner and admin roles
    if (!['propertyOwner', 'admin'].includes(role || '')) {
      console.log('Unauthorized role:', role);
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Only property owners or admins can access invoices' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    console.log('Connected to MongoDB');

    // For admins, fetch all invoices; for property owners, fetch only their invoices
    const query = role === 'admin' ? {} : { userId, status: 'pending' };
    const invoices = await db
      .collection('invoices')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`Fetched ${invoices.length} invoices for userId: ${userId}, role: ${role}`);
    console.log('GET /api/invoices - Completed in', Date.now() - startTime, 'ms');

    return NextResponse.json(
      {
        success: true,
        invoices: invoices.map((invoice) => ({
          ...invoice,
          _id: invoice._id.toString(),
          createdAt: invoice.createdAt?.toISOString?.(),
          updatedAt: invoice.updatedAt?.toISOString?.(),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching invoices:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
// src/app/api/list-properties/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import logger from '@/lib/logger';
import { buildInvalidCsrfResponse } from '@/lib/csrf';

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  quantity: number;
  vacant?: number;
}

interface PropertyListing {
  _id: ObjectId;
  originalPropertyId?: ObjectId;
  ownerId: string;
  name: string;
  address: string;
  description?: string;
  facilities: string[];
  unitTypes: UnitType[];
  images: string[];
  contactPhone?: string;
  isAdvertised: boolean;
  adExpiration?: Date;
  status: 'Active' | 'Inactive';
  createdAt: Date;
  updatedAt: Date;
}

const FACILITIES = [
  'Wi-Fi', 'Parking', 'Gym', 'Swimming Pool', 'Security',
  'Elevator', 'Air Conditioning', 'Heating', 'Balcony', 'Garden',
];


const summarizeAvailability = (unitTypes: UnitType[], totalTenants?: number) => {
  const totalUnits = unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);

  if (typeof totalTenants === "number") {
    const normalizedTenants = Math.max(0, totalTenants);
    const totalOccupied = Math.min(totalUnits, normalizedTenants);
    const totalVacant = Math.max(0, totalUnits - totalOccupied);
    const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;
    return { totalUnits, totalVacant, totalOccupied, occupancyRate };
  }

  const totalVacant = unitTypes.reduce((sum, unit) => sum + (unit.vacant ?? 0), 0);
  const totalOccupied = Math.max(0, totalUnits - totalVacant);
  const occupancyRate = totalUnits ? Math.round((totalOccupied / totalUnits) * 100) : 0;
  return { totalUnits, totalVacant, totalOccupied, occupancyRate };
};

async function validateCsrf(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('X-CSRF-Token');
  const cookieToken = (await cookies()).get('csrf-token')?.value;
  return token === cookieToken;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const listings = await db
      .collection<PropertyListing>('propertyListings')
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    const enriched = await Promise.all(
      listings.map(async (listing) => {
        const propertyId = listing.originalPropertyId
          ? listing.originalPropertyId.toString()
          : listing._id.toString();

        const tenants = await db
          .collection('tenants')
          .find({ propertyId })
          .toArray();

        const occupiedByType = tenants.reduce((acc: Record<string, number>, t) => {
          acc[t.unitType] = (acc[t.unitType] || 0) + 1;
          return acc;
        }, {});

        const unitTypes = (listing.unitTypes || []).map((u) => ({
          ...u,
          vacant: Math.max(0, u.quantity - (occupiedByType[u.type] || 0)),
        }));

        return {
          _id: listing._id.toString(),
          originalPropertyId: listing.originalPropertyId?.toString() || null,
          ownerId: listing.ownerId,
          name: listing.name,
          address: listing.address,
          description: listing.description,
          facilities: listing.facilities,
          unitTypes,
          images: listing.images,
          contactPhone: listing.contactPhone,
          isAdvertised: listing.isAdvertised,
          adExpiration: listing.adExpiration?.toISOString(),
          status: listing.status,
          createdAt: listing.createdAt.toISOString(),
          updatedAt: listing.updatedAt.toISOString(),
          availability: summarizeAvailability(unitTypes, tenants.length),
          occupiedByType,
        };
      })
    );

    return NextResponse.json(
      { success: true, properties: enriched },
      { status: 200 }
    );
  } catch (error) {
    const err = error as Error;
    logger.error('GET /api/list-properties', { error: err.message });
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;

    if (role !== 'propertyOwner' || !ObjectId.isValid(userId!)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!await validateCsrf(request)) {
      return buildInvalidCsrfResponse(request);
    }

    const body = await request.json();
    const {
      originalPropertyId,
      description,
      facilities = [],
      images = [],
      isAdvertised = false,
      contactPhone,
    } = body;

    if (!originalPropertyId || !ObjectId.isValid(originalPropertyId)) {
      return NextResponse.json(
        { success: false, message: 'Valid property ID required' },
        { status: 400 }
      );
    }

    if (images.length === 0 || images.length > 10) {
      return NextResponse.json(
        { success: false, message: '1–10 images required' },
        { status: 400 }
      );
    }

    if (facilities.length > 10) {
      return NextResponse.json(
        { success: false, message: 'Max 10 facilities' },
        { status: 400 }
      );
    }

    if (description && description.length > 500) {
      return NextResponse.json(
        { success: false, message: 'Description too long' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const contactPhoneValue =
      typeof contactPhone === "string" && contactPhone.trim()
        ? contactPhone.trim()
        : undefined;

    if (contactPhoneValue && !/^\+\d{8,15}$/.test(contactPhoneValue)) {
      return NextResponse.json(
        {
          success: false,
          message: "Contact phone must start with + and contain 8–15 digits total",
        },
        { status: 400 }
      );
    }

    const ownerProfile = await db.collection("propertyOwners").findOne(
      { _id: new ObjectId(userId as string) },
      { projection: { phone: 1 } }
    );
    const ownerPhoneValue =
      typeof ownerProfile?.phone === "string" && ownerProfile.phone.trim()
        ? ownerProfile.phone.trim()
        : undefined;

    const original = await db
      .collection('properties')
      .findOne({ _id: new ObjectId(originalPropertyId), ownerId: userId });

    if (!original) {
      return NextResponse.json(
        { success: false, message: 'Property not found' },
        { status: 404 }
      );
    }

    const existing = await db
      .collection('propertyListings')
      .findOne({ originalPropertyId: new ObjectId(originalPropertyId) });

    if (existing) {
      return NextResponse.json(
        { success: false, message: 'Already listed' },
        { status: 409 }
      );
    }

    const listing: Omit<PropertyListing, '_id'> = {
      originalPropertyId: new ObjectId(originalPropertyId),
      ownerId: userId as string,
      name: original.name,
      address: original.address,
      description: description?.trim(),
      facilities: facilities.filter((f: string) => FACILITIES.includes(f)),
      unitTypes: original.unitTypes.map((u: { type: string; price: number; deposit: number; quantity: number }) => ({
        type: u.type,
        price: u.price,
        deposit: u.deposit,
        quantity: u.quantity,
      })),
      images,
      contactPhone: contactPhoneValue ?? ownerPhoneValue,
      isAdvertised,
      adExpiration: isAdvertised
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : undefined,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db
      .collection<PropertyListing>('propertyListings')
      .insertOne(listing as PropertyListing);

    return NextResponse.json(
      {
        success: true,
        property: {
          ...listing,
          _id: result.insertedId.toString(),
          originalPropertyId: originalPropertyId,
          createdAt: listing.createdAt.toISOString(),
          updatedAt: listing.updatedAt.toISOString(),
          adExpiration: listing.adExpiration?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const err = error as Error;
    logger.error('POST /api/list-properties', { error: err.message });
    return NextResponse.json(
      { success: false, message: err.message || 'Server error' },
      { status: 500 }
    );
  }
}

// PUT, DELETE — same pattern (types added)
export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;

    if (role !== 'propertyOwner' || !ObjectId.isValid(userId!)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!await validateCsrf(request)) {
      return buildInvalidCsrfResponse(request);
    }

    const body = await request.json();
    const { _id, description, facilities = [], images = [], isAdvertised, contactPhone } = body;

    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid listing ID' },
        { status: 400 }
      );
    }

    if (images.length === 0 || images.length > 10) {
      return NextResponse.json(
        { success: false, message: '1–10 images required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const listing = await db
      .collection<PropertyListing>('propertyListings')
      .findOne({ _id: new ObjectId(_id), ownerId: userId });

    if (!listing) {
      return NextResponse.json(
        { success: false, message: 'Listing not found' },
        { status: 404 }
      );
    }

    const contactPhoneValue =
      typeof contactPhone === "string" && contactPhone.trim()
        ? contactPhone.trim()
        : contactPhone === "" || contactPhone === null
          ? ""
          : undefined;

    if (typeof contactPhoneValue === "string" && contactPhoneValue !== "" && !/^\+\d{8,15}$/.test(contactPhoneValue)) {
      return NextResponse.json(
        {
          success: false,
          message: "Contact phone must start with + and contain 8–15 digits total",
        },
        { status: 400 }
      );
    }

    const update: Partial<PropertyListing> = {
      description: description?.trim(),
      facilities: facilities.filter((f: string) => FACILITIES.includes(f)),
      images,
      isAdvertised,
      adExpiration: isAdvertised
        ? listing.isAdvertised
          ? listing.adExpiration
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : undefined,
      updatedAt: new Date(),
    };

    const updateDoc: Record<string, unknown> = { $set: update };
    if (contactPhoneValue === "") {
      (updateDoc.$set as any).contactPhone = undefined;
      updateDoc.$unset = { contactPhone: "" };
      delete (updateDoc.$set as any).contactPhone;
    } else if (typeof contactPhoneValue === "string") {
      (updateDoc.$set as any).contactPhone = contactPhoneValue;
    }

    await db
      .collection('propertyListings')
      .updateOne(
        { _id: new ObjectId(_id) },
        updateDoc
      );

    return NextResponse.json(
      { success: true, message: 'Listing updated' },
      { status: 200 }
    );
  } catch (error) {
    const err = error as Error;
    logger.error('PUT /api/list-properties', { error: err.message });
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('role')?.value;

    if (role !== 'propertyOwner' || !ObjectId.isValid(userId!)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!await validateCsrf(request)) {
      return buildInvalidCsrfResponse(request);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const result = await db
      .collection('propertyListings')
      .deleteOne({
        _id: new ObjectId(id),
        ownerId: userId,
      });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: 'Not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Listing removed' },
      { status: 200 }
    );
  } catch (error) {
    const err = error as Error;
    logger.error('DELETE /api/list-properties', { error: err });
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}


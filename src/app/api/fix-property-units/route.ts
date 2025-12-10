// src/app/api/fix-property-unit-quantities/route.ts

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getManagementFee } from '@/lib/unitTypes';
import { ObjectId } from 'mongodb';

// SAFETY: Prevent running twice or in non-production
let HAS_RUN = false;
const REQUIRED_SECRET = process.env.FIX_PROPERTY_UNITS_SECRET || 'CHANGE_ME_IN_PRODUCTION';

export const dynamic = 'force-dynamic'; // Ensure this runs fresh every time

export async function GET(request: Request) {
  // 1. Only allow in production
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json(
      { error: 'This endpoint can only run in production' },
      { status: 400 }
    );
  }

  // 2. Prevent double execution
  if (HAS_RUN) {
    return NextResponse.json(
      { error: 'Script has already run on this deployment' },
      { status: 400 }
    );
  }

  // 3. Require secret key
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== REQUIRED_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing secret' },
      { status: 401 }
    );
  }

  try {
    const startTime = Date.now();
    const { db } = await connectToDatabase();

    const properties = await db.collection('properties').find({}).toArray();
    let fixed = 0;
    let skipped = 0;

    console.log(`Starting fix for ${properties.length} properties...`);

    for (const prop of properties) {
      const originalUnitTypes = Array.isArray(prop.unitTypes) ? prop.unitTypes : [];
      let needsUpdate = false;
      let totalUnits = 0;

      const cleanedUnitTypes = originalUnitTypes.map((ut: any) => {
        const originalQty = ut.quantity;
        const safeQty = Math.max(1, Math.floor(Number(originalQty) || 0));

        totalUnits += safeQty;

        if (safeQty !== originalQty) {
          needsUpdate = true;
        }

        return {
          ...ut,
          quantity: safeQty,
          price: Number(ut.price) || 0,
          deposit: Number(ut.deposit) || 0,
        };
      });

      // Only update if something changed or managementFee is missing/invalid
      if (
        needsUpdate ||
        totalUnits === 0 ||
        !prop.managementFee ||
        prop.managementFee <= 0
      ) {
        const managementFee = getManagementFee({
          type: cleanedUnitTypes[0]?.type || 'Bedsitter',
          managementType: cleanedUnitTypes[0]?.managementType || 'RentCollection',
          quantity: totalUnits,
        });

        await db.collection('properties').updateOne(
          { _id: prop._id },
          {
            $set: {
              unitTypes: cleanedUnitTypes,
              managementFee,
              updatedAt: new Date(),
            },
          }
        );

        console.log(`Fixed: ${prop.name} (${prop._id}) → ${totalUnits} units, fee: Ksh ${managementFee}`);
        fixed++;
      } else {
        skipped++;
      }
    }

    HAS_RUN = true;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Log migration record
    await db.collection('migrations').insertOne({
      name: 'fix-property-unit-quantities-2025',
      ranAt: new Date(),
      fixed,
      skipped,
      durationSeconds: parseFloat(duration),
    });

    return NextResponse.json({
      success: true,
      message: 'Property unit quantities fixed successfully!',
      fixed,
      skipped,
      totalProcessed: properties.length,
      durationSeconds: duration,
      ranAt: new Date().toISOString(),
      warning: 'DELETE THIS FILE AFTER RUNNING ONCE',
    });
  } catch (error: any) {
    console.error('Fix script failed:', error);
    return NextResponse.json(
      {
        error: 'Script failed',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

// Optional: Add a HEAD route so you can test if it's deployed
export async function HEAD() {
  return new Response(null, { status: 200 });
}
// src/app/api/fix-property-units/route.ts  ← overwrite the old one

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getManagementFee } from '@/lib/unitTypes';

let HAS_RUN = false;
const REQUIRED_SECRET = process.env.FIX_PROPERTY_UNITS_SECRET || 'CHANGE_ME';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json({ error: 'Only runs in production' }, { status: 400 });
  }

  if (HAS_RUN) {
    return NextResponse.json({ error: 'Already ran' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== REQUIRED_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const properties = await db.collection('properties').find({}).toArray();

    let fixed = 0;

    for (const prop of properties) {
      const unitTypes = Array.isArray(prop.unitTypes) ? prop.unitTypes : [];

      // RECALCULATE total units from scratch
      const totalUnits = unitTypes.reduce((sum: number, ut: any) => {
        return sum + Math.max(1, Math.floor(Number(ut.quantity) || 0));
      }, 0);

      // Always recalculate managementFee based on actual total units
      const correctManagementFee = totalUnits > 0 ? getManagementFee({
        type: unitTypes[0]?.type || 'Bedsitter',
        managementType: unitTypes[0]?.managementType || 'RentCollection',
        quantity: totalUnits,
      }) : 0;

      // Force update if managementFee is wrong OR quantity was invalid
      const currentFee = Number(prop.managementFee) || 0;
      const feeIsWrong = Math.abs(currentFee - correctManagementFee) > 10; // allow small rounding

      if (feeIsWrong || totalUnits === 0) {
        await db.collection('properties').updateOne(
          { _id: prop._id },
          {
            $set: {
              managementFee: correctManagementFee,
              updatedAt: new Date(),
              // Optional: add a flag so you know it was fixed
              fixedByMigration2025: true,
            },
          }
        );

        console.log(`FIXED → ${prop.name} | Units: ${totalUnits} | Old fee: ${currentFee} → New: ${correctManagementFee}`);
        fixed++;
      }
    }

    HAS_RUN = true;

    await db.collection('migrations').insertOne({
      name: 'fix-property-units-2025-v2',
      fixed,
      ranAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'Fixed outdated management fees & unit counts!',
      fixed,
      note: 'This version forces correct managementFee based on actual total units',
      DELETE_THIS_FILE_NOW: true,
    });

  } catch (error: any) {
    console.error('Migration failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
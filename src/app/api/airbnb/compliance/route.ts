import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { ensureAirbnbSeed } from "@/lib/airbnb-seed";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  await ensureAirbnbSeed(db, ownerId);

  const compliance = await db
    .collection("airbnbCompliance")
    .find({ ownerId })
    .sort({ ktraExpiry: 1 })
    .toArray();

  return NextResponse.json({
    success: true,
    compliance: compliance.map((item) => ({
      propertyId: item.externalId || item._id?.toString?.() || "",
      propertyName: item.propertyName,
      ktraLicense: item.ktraLicense,
      ktraExpiry: item.ktraExpiry,
      countyPermitExpiry: item.countyPermitExpiry,
      nemaExpiry: item.nemaExpiry,
      status: item.status,
      nextAction: item.nextAction,
    })),
  });
}
